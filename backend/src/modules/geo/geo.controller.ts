import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { GeoService } from './geo.service';

@ApiTags('geo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geo')
export class GeoController {
  constructor(private readonly svc: GeoService) {}

  // GET /api/v1/geo/reverse?lat=13.7563&lon=100.5018
  @Get('reverse')
  @ApiOperation({ summary: 'Reverse-geocode coordinates to an address (self-host Nominatim)' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lon', type: Number })
  reverse(@Query('lat') lat: string, @Query('lon') lon: string) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException({
        error: {
          code: 'COS-GEO-001',
          message: 'lat and lon are required numeric query params',
        },
      });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new BadRequestException({
        error: { code: 'COS-GEO-002', message: 'lat/lon out of range' },
      });
    }
    return this.svc.reverseGeocode(latitude, longitude);
  }
}
