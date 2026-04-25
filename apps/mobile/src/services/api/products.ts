import {
  getProducts,
  type Product,
  type ProductsResponse,
} from '@miliguan/api-client';
import { getApiClient, shouldUseMocks } from './client';

export type { Product, ProductsResponse };

export async function fetchProducts(): Promise<ProductsResponse> {
  if (shouldUseMocks()) {
    return {
      success: true,
      time: new Date().toISOString(),
      message: 'mock',
      total_products: 0,
      offset: 0,
      limit: 8,
      products: [],
    };
  }
  return getProducts(getApiClient(), { page: 1, limit: 8 });
}
