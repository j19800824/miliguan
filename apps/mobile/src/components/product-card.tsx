import type { Product } from '@miliguan/api-client';
import { Image, StyleSheet, Text, View } from 'react-native';

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: product.photo_url }} style={styles.image} resizeMode="cover" />
      <View style={styles.cardBody}>
        <Text style={styles.category}>{product.category}</Text>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {product.description}
        </Text>
        <Text style={styles.price}>${product.price.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: '#e5e7eb',
  },
  cardBody: {
    padding: 16,
  },
  category: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#2563eb',
  },
  name: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  description: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
  },
  price: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
});
