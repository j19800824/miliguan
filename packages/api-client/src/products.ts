export type Product = {
  photo_url: string;
  name: string;
  description: string;
  created_at?: string;
  price: number;
  id: number;
  category: string;
  updated_at?: string;
};

export type ProductFilters = {
  page?: number;
  limit?: number;
  categories?: string;
  search?: string;
  sort?: string;
};

export type ProductsResponse = {
  success: boolean;
  time: string;
  message: string;
  total_products: number;
  offset: number;
  limit: number;
  products: Product[];
};

export type ProductByIdResponse = {
  success: boolean;
  time: string;
  message: string;
  product: Product;
};

export type ProductMutationPayload = {
  name: string;
  category: string;
  price: number;
  description: string;
};

export async function getProducts(
  apiClient: <T>(endpoint: string, init?: RequestInit) => Promise<T>,
  filters: ProductFilters = {}
) {
  const params = new URLSearchParams();

  if (filters.page !== undefined) {
    params.set('page', String(filters.page));
  }

  if (filters.limit !== undefined) {
    params.set('limit', String(filters.limit));
  }

  if (filters.categories) {
    params.set('categories', filters.categories);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.sort) {
    params.set('sort', filters.sort);
  }

  const query = params.toString();
  const endpoint = query ? `/products?${query}` : '/products';

  return apiClient<ProductsResponse>(endpoint);
}
