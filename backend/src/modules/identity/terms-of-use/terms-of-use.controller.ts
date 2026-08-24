// Terms of Use document endpoints (ADR-092).
//
// PUBLIC, on the same reasoning as the Privacy Policy next door: the terms are what a person reads
// BEFORE deciding to sign up, and a document you must authenticate to read is not one they can act
// on. Both routes are safe reads of one static document — no tenant, no user, no parameter — so
// there is nothing here to scope or to leak.

import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
// `express` types with `@Res({ passthrough: true })`, matching privacy-policy.controller.ts and
// boq.controller.ts's CSV export. The app runs on Fastify, but `header()` is present on both reply
// objects and `@types/express` is already a devDependency; pulling in `fastify` types purely to
// annotate one parameter would add a dependency (Rule 26/28) for no behaviour.
import type { Response } from 'express';
import { legalPdfMetadata, sendLegalPdf, type LegalPdfMetadata } from '../legal-document';
import { TermsOfUseService } from './terms-of-use.service';

@ApiTags('terms-of-use')
@Controller('terms')
export class TermsOfUseController {
  constructor(private readonly service: TermsOfUseService) {}

  // Metadata first, because that is what the client needs BEFORE downloading: the expected digest, so
  // it can verify what it received rather than trust it.
  @Get('metadata')
  @ApiOperation({
    summary: 'Version, effective date, file name and SHA-256 of the Terms of Use PDF',
    description:
      'Fetched before the download so the client can verify the bytes it receives. The digest is ' +
      'stable: the document has no per-request input and its PDF timestamps are pinned to the ' +
      'effective date, so the same version always produces the same bytes.',
  })
  @ApiResponse({ status: 200, description: 'Document metadata' })
  async metadata(): Promise<LegalPdfMetadata> {
    return legalPdfMetadata(await this.service.getPdf());
  }

  @Get('pdf')
  @ApiOperation({ summary: 'The Terms of Use as a PDF' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The document' })
  @Header('Cache-Control', 'public, max-age=3600')
  async pdf(@Res({ passthrough: true }) res: Response): Promise<Buffer> {
    return sendLegalPdf(res, await this.service.getPdf());
  }
}
