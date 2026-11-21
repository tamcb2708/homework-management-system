import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { FilesService } from './files.service';

class UploadDto {
  @IsIn(['ASSIGNMENT_ATTACHMENT', 'QUESTION_MEDIA', 'ANSWER_UPLOAD']) purpose: 'ASSIGNMENT_ATTACHMENT' | 'QUESTION_MEDIA' | 'ANSWER_UPLOAD';
}

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, purpose: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDto) {
    return this.svc.upload(file, dto.purpose);
  }

  /** Tải tệp sau khi kiểm tra quyền; luôn ở dạng attachment. */
  @Get(':id/download')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.svc.download(id);
    if (r.url) return res.redirect(302, r.url);
    res.setHeader('Content-Type', r.file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.file.originalName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(r.body);
  }
}
