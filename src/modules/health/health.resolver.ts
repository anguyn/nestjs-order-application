import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class HealthResolver {
  @Query(() => String, { description: 'Health check query' })
  health(): string {
    return 'OK';
  }
}
