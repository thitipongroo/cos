// Privacy Policy document endpoints (ADR-091).
//
// PUBLIC, and necessarily so: the policy is what a person reads BEFORE deciding to sign up, and a
// notice you must authenticate to read is not a notice. Both routes are safe reads of one static
// document — no tenant, no user, no parameter — so there is nothing here to scope or to leak.
//
// NOT behind the inquiry feature flag. `s1.identity.privacy-inquiry` is the abuse switch for a route
// that WRITES; turning it off must not take the policy document down with it.

import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
// `express` types with `@Res({ passthrough: true })`, matching boq.controller.ts's CSV export — the
// one other binary/att achment response in this codebase. The app runs on Fastify, but `header()` is
// present on both reply objects and `@types/express` is already a devDependency; pulling in `fastify`
// types purely to annotate one parameter would add a dependency (Rule 26/28) for no behaviour.
import type { Response } from 'express';
import { PrivacyPolicyService } from './privacy-policy.service';

@ApiTags('privacy-policy')
@Controller('privacy/policy')
export class PrivacyPolicyController {
  constructor(private readonly service: PrivacyPolicyService) {}

  // Metadata first, because that is what the client needs BEFORE downloading: the expected digest,
  // so it can verify what it received rather than trust it.
  @Get('metadata')
  @ApiOperation({
    summary: 'Version, effective date, file name and SHA-256 of the policy PDF',
    description:
      'Fetched before the download so the client can verify the bytes it receives. The digest is ' +
      'stable: the document has no per-request input and its PDF timestamps are pinned to the ' +
      'effective date, so the same version always produces the same bytes.',
  })
  @ApiResponse({ status: 200, description: 'Document metadata' })
  async metadata() {
    const pdf = await this.service.getPdf();
    return {
      version: pdf.version,
      effective_date: pdf.effectiveDate,
      file_name: pdf.fileName,
      sha256: pdf.sha256,
      size_bytes: pdf.bytes.length,
      // English only: pdf-lib's standard fonts carry no Thai glyphs, and embedding a Thai face is a
      // font-licensing decision nobody has taken. Stated rather than implied, so a Thai reader is not
      // left wondering why the download is not in their language.
      language: 'en',
    };
  }

  @Get('pdf')
  @ApiOperation({ summary: 'The Privacy Policy as a PDF' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The document' })
  @Header('Cache-Control', 'public, max-age=3600')
  async pdf(@Res({ passthrough: true }) res: Response): Promise<Buffer> {
    const doc = await this.service.getPdf();
    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.header('Content-Length', String(doc.bytes.length));
    // ETag is the content digest, so a conditional request is answered without rebuilding anything
    // and a proxy cannot serve a stale edition under a new version number.
    res.header('ETag', `"${doc.sha256}"`);
    return doc.bytes;
  }
}
