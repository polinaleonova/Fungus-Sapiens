import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import type { DetectionBox } from '@/components/detection-overlay';

/** Shape returned by the existing Fungus Sapiens FastAPI POST /detect. */
export type DetectionResponse = {
  frame_id: string;
  width: number;
  height: number;
  detections: DetectionBox[];
  inference_ms: number;
  device: string;
};

export class GpuBusyError extends Error {
  constructor() {
    super('GPU занят. Кадр пропущен.');
    this.name = 'GpuBusyError';
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function validDetection(input: unknown): input is DetectionBox {
  if (!isRecord(input)) return false;
  const { id, label, confidence, x1, y1, x2, y2 } = input;
  return typeof id === 'string' && typeof label === 'string' &&
    typeof confidence === 'number' && confidence >= 0 && confidence <= 1 &&
    typeof x1 === 'number' && Number.isFinite(x1) && x1 >= 0 && x1 <= 1 &&
    typeof y1 === 'number' && Number.isFinite(y1) && y1 >= 0 && y1 <= 1 &&
    typeof x2 === 'number' && Number.isFinite(x2) && x2 > x1 && x2 <= 1 &&
    typeof y2 === 'number' && Number.isFinite(y2) && y2 > y1 && y2 <= 1;
}

function parseDetectionResponse(data: unknown): DetectionResponse {
  if (!isRecord(data) ||
      typeof data.frame_id !== 'string' ||
      typeof data.width !== 'number' || !Number.isFinite(data.width) || data.width <= 0 ||
      typeof data.height !== 'number' || !Number.isFinite(data.height) || data.height <= 0 ||
      typeof data.inference_ms !== 'number' ||
      typeof data.device !== 'string' ||
      !Array.isArray(data.detections) || !data.detections.every(validDetection)) {
    throw new Error('Неверный формат ответа сервера /detect.');
  }
  return data as DetectionResponse;
}

/**
 * The backend expects multipart/form-data with the *singular* field name "file".
 * Expo File implements Blob on iOS/Android. Never manually set Content-Type:
 * expo/fetch adds the multipart boundary for us.
 */
export async function detectMushrooms(uri: string, signal: AbortSignal): Promise<DetectionResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Не задан EXPO_PUBLIC_API_URL в mobile/.env.');
  }

  const form = new FormData();
  form.append('file', new File(uri));

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/detect`, {
      method: 'POST',
      body: form,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(`Не удалось связаться с ${baseUrl}. Проверьте IP, Wi-Fi и брандмауэр.`, {
      cause: error,
    });
  }

  if (response.status === 429) throw new GpuBusyError();
  if (!response.ok) {
    let description = '';
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.detail === 'string') description = `: ${body.detail}`;
    } catch {
      // May be a proxy error without JSON body.
    }
    throw new Error(`Сервер вернул HTTP ${response.status}${description}`);
  }
  return parseDetectionResponse(await response.json());
}
