import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { StartupSplashConfig } from '../services/api/app-splash';

const bundledSplash = require('../../assets/splash.png');

interface StartupSplashScreenProps {
  config: StartupSplashConfig;
  onDone: () => void;
}

export function StartupSplashScreen({ config, onDone }: StartupSplashScreenProps) {
  const cachedImage = config.localImageUri || config.imageUrl;

  useEffect(() => {
    const timer = setTimeout(onDone, config.durationMs);
    return () => clearTimeout(timer);
  }, [config.durationMs, onDone]);

  return (
    <View style={styles.container}>
      <Image
        source={cachedImage ? { uri: cachedImage } : bundledSplash}
        resizeMode="cover"
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff7ec',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
});
