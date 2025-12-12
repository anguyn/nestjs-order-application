import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export function getLanguageFromContext(context: ExecutionContext): string {
  if (context.getType<'graphql'>() === 'graphql') {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;
    return req.language || 'en';
  }

  const request = context.switchToHttp().getRequest();
  return (
    request.language ||
    request.query?.lang ||
    request.headers['accept-language']?.split(',')[0] ||
    'en'
  );
}
