import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const photoAngles = [
  'Cap — top view',
  'Gills or pores — underside',
  'Stem and base',
  'Whole mushroom in its habitat',
];

export default function HomeScreen() {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.logo}>🍄 FUNGUS SAPIENS</Text>

      <Text style={styles.title}>
        Discover mushrooms with AI
      </Text>

      <Text style={styles.description}>
        Take multiple photos of one mushroom
        and get an AI-powered identification
        suggestion.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Start a new observation
        </Text>

        <Text style={styles.description}>
          We recommend taking up to four photos
          from different angles.
        </Text>

        <Pressable
          style={styles.button}
          onPress={() => setShowGuide(!showGuide)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {showGuide ? 'Hide photo guide' : 'Show photo guide'}
          </Text>
        </Pressable>

        {showGuide && photoAngles.map((angle) => (
          <Text key={angle} style={styles.guideItem}>
            • {angle}
          </Text>
        ))}
      </View>

      <Text style={styles.warning}>
        ⚠️ AI identification can be incorrect.
        Never use this app to decide whether
        a mushroom is safe to eat.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F7F0',
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#277047',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#193D2B',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#52645A',
    lineHeight: 24,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 20,
    marginTop: 20,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#193D2B',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#277047',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  guideItem: {
    color: '#193D2B',
    fontSize: 15,
    marginTop: 12,
  },
  warning: {
    marginTop: 30,
    color: '#77552F',
    lineHeight: 22,
  },
});