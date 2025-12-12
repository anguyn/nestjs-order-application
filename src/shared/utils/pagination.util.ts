import { PaginationParams, PaginatedResult } from '../types/common.types';
import { PAGINATION } from '../constants/global.constant';

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  const { page = 1, limit = PAGINATION.DEFAULT_PAGE_SIZE } = params;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
