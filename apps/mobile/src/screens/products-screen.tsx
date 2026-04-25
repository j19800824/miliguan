import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { Product } from '@miliguan/api-client';
import { ProductCard } from '../components/product-card';
import { fetchProducts } from '../services/api/products';

export function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        const data = await fetchProducts();

        if (active) {
          setProducts(data.products);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MiLiGuan Mobile</Text>
        <Text style={styles.title}>Products</Text>
        <Text style={styles.subtitle}>
          Expo app connected to the Next.js `/api/products` endpoint.
        </Text>
      </View>

      {loading ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator size="large" color="#111827" />
          <Text style={styles.stateText}>Loading products...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.errorTitle}>Connection failed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hintText}>
            Set `EXPO_PUBLIC_API_BASE_URL` to something like `http://192.168.1.10:3000/api`
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <ProductCard product={item} />}
          ListFooterComponent={
            <Text style={styles.footerText}>Loaded {products.length} items from Next.js API</Text>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#2563eb',
  },
  title: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
  },
  stateBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  stateText: {
    fontSize: 15,
    color: '#374151',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#991b1b',
  },
  errorText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#7f1d1d',
  },
  hintText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  listContent: {
    padding: 20,
    gap: 14,
  },
  footerText: {
    paddingVertical: 10,
    textAlign: 'center',
    fontSize: 13,
    color: '#6b7280',
  },
});
