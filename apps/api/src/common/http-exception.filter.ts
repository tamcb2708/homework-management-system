import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { maybeCtx } from './context';

/** Uniform error envelope: { error: { code, message, details?, requestId } }. Never leaks stack traces or SQL. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = maybeCtx()?.requestId;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (body && typeof body === 'object' && body.code) {
        code = body.code;
        message = body.message;
        details = body.details;
      } else if (status === HttpStatus.BAD_REQUEST && body && Array.isArray(body.message)) {
        code = 'VALIDATION_ERROR';
        message = 'Dữ liệu không hợp lệ.';
        details = body.message;
      } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
        code = 'RATE_LIMITED';
        message = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
      } else if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = 'Không tìm thấy dữ liệu.';
      } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Dữ liệu gửi lên quá lớn.';
      } else {
        code = HttpStatus[status] ?? code;
        message = typeof body === 'string' ? body : (body?.message ?? message);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = 'Dữ liệu đã tồn tại.';
        details = { fields: (exception.meta as any)?.target };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Không tìm thấy dữ liệu.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        code = 'INVALID_REFERENCE';
        message = 'Dữ liệu tham chiếu không hợp lệ.';
      }
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId, path: req.path }, 'Unhandled error');
    }
    res.status(status).json({ error: { code, message, details, requestId } });
  }
}
