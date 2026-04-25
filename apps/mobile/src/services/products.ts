import {
  createApiClient,
  getProducts,
  type Product,
  type ProductsResponse
} from '@miliguan/api-client';
import { apiBaseUrl } from '../config/env';

export type { Product, ProductsResponse };

export async function fetchProducts() {
  if (!apiBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
  }

  const apiClient = createApiClient({ baseUrl: apiBaseUrl });
  return getProducts(apiClient, { page: 1, limit: 8 });
}
