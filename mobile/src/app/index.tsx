import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetectionOverlay, type DetectionBox } from '@/components/detection-overlay';
import { detectMushrooms, GpuBusyError } from '@/lib/detection-api';

type CaptureRate = 1 | 5 | 10;
type Size = { width: number; height: number };

const CAPTURE_RATES: CaptureRate[] = [1, 5, 10];
const REQUEST_TIMEOUT_MS = 9_000;
const MAX_FRAME_SIDE = 1_280; // Reduced image avoids backend's 12 MP / 5 MiB limits.
const BOX_TTL_MS = 1_700;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim();

export default function HomeScreen() {
  const safe = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const captureInProgress = useRef(false);
  const recentCaptureTimes = useRef<number[]>([]);
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [captureRate, setCaptureRate] = useState<CaptureRate>(5);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [actualRate, setActualRate] = useState(0);
  const [lastResolution, setLastResolution] = useState<string | null>(null);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [detections, setDetections] = useState<DetectionBox[]>([]);
  const [sourceSize, setSourceSize] = useState<Size | null>(null);
  const [previewSize, setPreviewSize] = useState<Size>({ width: 0, height: 0 });
  const [lastResultAt, setLastResultAt] = useState(0);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => {
      setFocused(false);
      setScanning(false);
      setCameraReady(false);
      setTorchEnabled(false);
      setDetections([]);
    };
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      if (!active) {
        setScanning(false);
        setDetections([]);
      }
    });
    return () => subscription.remove();
  }, []);

  const cameraVisible = permission?.granted === true && focused && appActive;
  const canScan = cameraVisible && cameraReady && !cameraError &&
    !!API_BASE_URL && Platform.OS !== 'web';
  const captureActive = canScan && scanning;

  useEffect(() => {
    if (!captureActive) return;
    let cancelled = false;
    let controller: AbortController | null = null;

    const captureFrame = async () => {
      // Capture + HTTP inference form one operation: only one in-flight frame.
      // If GPU/phone/network are slower than the target FPS, skip intervals.
      if (cancelled || captureInProgress.current || !cameraRef.current) return;
      captureInProgress.current = true;
      const temporaryUris: string[] = [];

      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: false,
          quality: 0.45,
          shutterSound: false,
          // Keep default image processing so the JPEG orientation is reliable.
          skipProcessing: false,
        });
        if (!photo) return;
        temporaryUris.push(photo.uri);
        if (cancelled) return;

        const now = Date.now();
        const times = recentCaptureTimes.current.filter((time) => now - time <= 3000);
        times.push(now);
        recentCaptureTimes.current = times;
        const observedRate = times.length >= 2
          ? (times.length - 1) * 1000 / (times[times.length - 1] - times[0])
          : 0;
        setCapturedCount((count) => count + 1);
        setActualRate(Math.round(observedRate * 10) / 10);

        // Typical smartphone photos are >12 megapixels. Sending them raw
        // would be rejected by FastAPI and waste bandwidth. Preserve aspect ratio.
        let uploadUri = photo.uri;
        let uploadWidth = photo.width;
        let uploadHeight = photo.height;
        if (Math.max(photo.width, photo.height) > MAX_FRAME_SIDE) {
          const image = ImageManipulator.manipulate(photo.uri);
          if (photo.width >= photo.height) {
            image.resize({ width: MAX_FRAME_SIDE, height: null });
          } else {
            image.resize({ width: null, height: MAX_FRAME_SIDE });
          }
          const resized = await (await image.renderAsync()).saveAsync({
            format: SaveFormat.JPEG,
            compress: 0.55,
          });
          temporaryUris.push(resized.uri);
          uploadUri = resized.uri;
          uploadWidth = resized.width;
          uploadHeight = resized.height;
        }
        if (cancelled) return;
        setLastResolution(`${uploadWidth} × ${uploadHeight}`);

        const requestController = new AbortController();
        controller = requestController;
        const timeout = setTimeout(() => requestController.abort(), REQUEST_TIMEOUT_MS);
        try {
          const result = await detectMushrooms(uploadUri, requestController.signal);
          if (cancelled) return;
          setProcessedCount((count) => count + 1);
          setLastInferenceMs(result.inference_ms);
          setSourceSize({ width: result.width, height: result.height });
          setDetections(result.detections);
          setLastResultAt(Date.now());
          setNetworkError(null);
        } catch (error) {
          if (cancelled) return;
          // HTTP errors and timeouts are NOT camera errors. Keep scanning.
          setDetections([]);
          setLastInferenceMs(null);
          if (error instanceof GpuBusyError) {
            setNetworkError('GPU занят — кадр пропущен');
          } else if (requestController.signal.aborted) {
            setNetworkError('Превышено время ожидания ответа (9 с)');
          } else {
            setNetworkError(error instanceof Error ? error.message : 'Ошибка сети');
          }
        } finally {
          clearTimeout(timeout);
          if (controller === requestController) controller = null;
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Camera capture failed:', error);
          setCameraError(error instanceof Error ? error.message : 'Ошибка камеры');
          setScanning(false);
          setDetections([]);
        }
      } finally {
        // Never keep captured JPEG files on the phone after inference.
        if (Platform.OS !== 'web') {
          for (const uri of new Set(temporaryUris)) {
            if (!uri.startsWith('file:')) continue;
            try {
              new File(uri).delete();
            } catch (error) {
              console.warn('Could not delete camera frame:', error);
            }
          }
        }
        captureInProgress.current = false;
      }
    };

    void captureFrame();
    const timer = setInterval(() => { void captureFrame(); }, 1000 / captureRate);
    return () => {
      cancelled = true;
      clearInterval(timer);
      controller?.abort();
    };
  }, [captureActive, captureRate]);

  // A moving camera makes an old BBox misleading. Hide unrefreshed overlays.
  useEffect(() => {
    if (!captureActive || detections.length === 0) return;
    const timeout = setTimeout(() => setDetections([]), BOX_TTL_MS);
    return () => clearTimeout(timeout);
  }, [captureActive, detections, lastResultAt]);

  const toggleScanning = () => {
    if (!canScan) return;
    setDetections([]);
    setNetworkError(null);
    if (!scanning) {
      recentCaptureTimes.current = [];
      setActualRate(0);
      setCapturedCount(0);
      setProcessedCount(0);
      setLastResolution(null);
      setLastInferenceMs(null);
      setSourceSize(null);
    }
    setScanning((current) => !current);
  };

  const statusLabel = cameraError
    ? 'Ошибка камеры'
    : !cameraVisible
      ? 'Камера выключена'
      : !cameraReady
        ? 'Подключение камеры'
        : !API_BASE_URL
          ? 'Нет адреса сервера'
          : scanning
            ? (networkError ? 'Ожидаем сервер' : 'Поиск грибов · GPU')
            : 'Готово к поиску';

  return (
    <View style={[styles.screen, { paddingTop: Math.max(safe.top, 12) + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>🍄 FUNGUS SAPIENS</Text>
          <Text style={styles.title}>Поиск грибов</Text>
          <Text style={styles.subtitle}>Наведите камеру на лесную подстилку</Text>
        </View>
      </View>

      <View
        style={styles.cameraFrame}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setPreviewSize({ width, height });
        }}>
        {cameraVisible && !cameraError ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            animateShutter={false}
            enableTorch={torchEnabled}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              setCameraReady(false);
              setScanning(false);
              setDetections([]);
              setCameraError(event.message);
            }}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraPlaceholderIcon}>◉</Text>
            <Text style={styles.cameraPlaceholderTitle}>
              {cameraError ? 'Не удалось запустить камеру' : 'Доступ к камере'}
            </Text>
            <Text style={styles.cameraPlaceholderDescription}>
              {cameraError ?? (permission === null
                ? 'Проверяем разрешения…'
                : permission?.granted
                  ? 'Камера временно недоступна'
                  : 'Разрешите доступ, чтобы видеть изображение в реальном времени')}
            </Text>
            {permission && !permission.granted && (
              <Pressable
                accessibilityRole="button"
                style={styles.permissionButton}
                onPress={() => {
                  if (permission.canAskAgain) void requestPermission();
                  else void Linking.openSettings();
                }}>
                <Text style={styles.permissionButtonText}>
                  {permission.canAskAgain ? 'Разрешить камеру' : 'Открыть настройки'}
                </Text>
              </Pressable>
            )}
            {cameraError && (
              <Pressable
                accessibilityRole="button"
                style={styles.permissionButton}
                onPress={() => { setCameraError(null); setCameraReady(false); }}>
                <Text style={styles.permissionButtonText}>Повторить</Text>
              </Pressable>
            )}
          </View>
        )}

        <DetectionOverlay
          boxes={captureActive ? detections : []}
          sourceWidth={sourceSize?.width ?? 0}
          sourceHeight={sourceSize?.height ?? 0}
          previewWidth={previewSize.width}
          previewHeight={previewSize.height}
        />

        <View pointerEvents="none" style={styles.cameraTopBar}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, captureActive && !networkError && styles.activeDot]} />
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          {captureActive && (
            <View style={styles.detectionPill}>
              <Text style={styles.detectionPillText}>Найдено: {detections.length}</Text>
            </View>
          )}
        </View>
        <View pointerEvents="none" style={styles.cameraBottomBar}>
          <Text style={styles.cameraHint}>
            {networkError ?? (captureActive
              ? 'YOLO-World обрабатывает кадры. Ведите камеру медленно.'
              : 'Нажмите «Начать поиск», чтобы распознавать грибы')}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.counterRow}>
          <View>
            <Text style={styles.metricLabel}>Снято кадров</Text>
            <Text style={styles.metricValue}>{capturedCount}</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Обработано</Text>
            <Text style={styles.metricValue}>{processedCount}</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Частота</Text>
            <Text style={styles.metricValue}>{actualRate.toFixed(1)} <Text style={styles.metricUnit}>к/с</Text></Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>YOLO CUDA</Text>
            <Text style={styles.metricResolution}>
              {lastInferenceMs === null ? '—' : `${Math.round(lastInferenceMs)} мс`}
            </Text>
          </View>
        </View>

        <View style={styles.rateRow}>
          <Text style={styles.sectionLabel}>Целевая частота</Text>
          <View style={styles.rateButtons}>
            {CAPTURE_RATES.map((rate) => (
              <Pressable
                key={rate}
                accessibilityRole="button"
                accessibilityState={{ selected: captureRate === rate }}
                style={[styles.rateButton, captureRate === rate && styles.rateButtonActive]}
                onPress={() => setCaptureRate(rate)}>
                <Text style={[styles.rateText, captureRate === rate && styles.rateTextActive]}>
                  {rate} / с
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canScan }}
          disabled={!canScan}
          onPress={toggleScanning}
          style={[styles.mainButton, scanning && styles.stopButton, !canScan && styles.disabledButton]}>
          <Text style={styles.mainButtonText}>
            {scanning ? '■  Остановить поиск' : '●  Начать поиск грибов'}
          </Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!cameraVisible || !cameraReady}
            style={[styles.secondaryButton, (!cameraVisible || !cameraReady) && styles.disabledButton]}
            onPress={() => setTorchEnabled((current) => !current)}>
            <Text style={styles.secondaryButtonText}>
              {torchEnabled ? '🔦 Выкл. фонарик' : '🔦 Фонарик'}
            </Text>
          </Pressable>
          <View style={[styles.secondaryButton, styles.serverBadge]}>
            <Text numberOfLines={1} style={styles.secondaryButtonText}>
              {API_BASE_URL ? `API: ${API_BASE_URL}` : 'Настройте mobile/.env'}
            </Text>
          </View>
        </View>
        <Text style={styles.footerNote}>
          {lastResolution ? `Последний кадр: ${lastResolution}. ` : ''}
          Модель может ошибаться. Не используйте результат для проверки съедобности.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1D15', paddingHorizontal: 15, paddingBottom: 12 },
  header: { paddingHorizontal: 4, paddingTop: 3, paddingBottom: 13 },
  brand: { color: '#B6FE67', fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: '#FFFFFF', fontSize: 27, fontWeight: '800', marginTop: 3 },
  subtitle: { color: '#A9BEB0', fontSize: 12, marginTop: 3 },
  cameraFrame: { flex: 1, minHeight: 200, overflow: 'hidden', borderRadius: 22, backgroundColor: '#152D21' },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  cameraPlaceholderIcon: { fontSize: 55, color: '#B6FE67', marginBottom: 5 },
  cameraPlaceholderTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 19, textAlign: 'center' },
  cameraPlaceholderDescription: { color: '#A9BEB0', textAlign: 'center', marginTop: 10, fontSize: 13, lineHeight: 19 },
  permissionButton: { backgroundColor: '#B6FE67', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14, marginTop: 20 },
  permissionButtonText: { color: '#10251A', fontWeight: '800' },
  cameraTopBar: { position: 'absolute', top: 14, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, backgroundColor: 'rgba(11, 29, 21, 0.83)', paddingVertical: 9, paddingHorizontal: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: '#9AADA3' },
  activeDot: { backgroundColor: '#B6FE67' },
  statusText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  detectionPill: { borderRadius: 99, backgroundColor: '#B6FE67', paddingHorizontal: 10, paddingVertical: 7 },
  detectionPillText: { color: '#0B1D15', fontSize: 10, fontWeight: '800' },
  cameraBottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 13, backgroundColor: 'rgba(11, 29, 21, 0.72)' },
  cameraHint: { textAlign: 'center', color: '#EDF7EF', fontSize: 11, fontWeight: '600' },
  controls: { paddingTop: 13 },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 13, gap: 8 },
  metricLabel: { color: '#95AD9E', fontSize: 10, fontWeight: '600', marginBottom: 4 },
  metricValue: { color: '#FFFFFF', fontWeight: '800', fontSize: 19 },
  metricUnit: { fontSize: 11, fontWeight: '500', color: '#C5D9CB' },
  metricResolution: { color: '#FFFFFF', fontWeight: '700', fontSize: 13, marginTop: 4 },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionLabel: { color: '#D8E8DD', fontWeight: '700', fontSize: 12 },
  rateButtons: { flexDirection: 'row', gap: 7 },
  rateButton: { backgroundColor: '#203A2C', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 },
  rateButtonActive: { backgroundColor: '#B6FE67' },
  rateText: { color: '#D1DED5', fontWeight: '800', fontSize: 12 },
  rateTextActive: { color: '#122619' },
  mainButton: { backgroundColor: '#B6FE67', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  stopButton: { backgroundColor: '#F0B58F' },
  mainButtonText: { color: '#122619', fontWeight: '800', fontSize: 15 },
  disabledButton: { opacity: 0.42 },
  secondaryRow: { flexDirection: 'row', gap: 9, marginTop: 9 },
  secondaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#34513F', paddingVertical: 12, paddingHorizontal: 8 },
  secondaryButtonText: { color: '#D2E4D7', fontSize: 12, fontWeight: '700' },
  serverBadge: { flex: 1.8 },
  footerNote: { marginTop: 10, fontSize: 10, lineHeight: 15, textAlign: 'center', color: '#A5B9AB' },
});
