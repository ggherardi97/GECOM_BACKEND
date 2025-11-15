import { Prisma } from '@prisma/client';

export interface PaginateParams<TWhere, TSelect, TInclude> {
  page?: number;
  limit?: number;
  where?: TWhere;
  select?: TSelect;
  include?: TInclude;
  orderBy?: Prisma.Enumerable<Prisma.SortOrder | object>;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function paginate<TModel extends { findMany: any; count: any }, TEntity>(
  model: TModel,
  params: PaginateParams<any, any, any>
): Promise<PaginatedResult<TEntity>> {
  const { page = 1, limit = 10, where, select, include, orderBy } = params;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({
      skip,
      take: limit,
      where,
      select,
      include,
      orderBy,
    }),
    model.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
