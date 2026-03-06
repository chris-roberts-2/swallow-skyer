import { computePlanCorners } from '../../utils/planGeoreference';

describe('planGeoreference', () => {
  it('rejects invalid image dimensions', () => {
    expect(
      computePlanCorners({
        imageWidth: 0,
        imageHeight: 100,
        calibrationPairs: [
          { pixel: [0, 0], geo: [-98.5, 39.8] },
          { pixel: [100, 100], geo: [-98.4, 39.7] },
        ],
      }).success
    ).toBe(false);
    expect(
      computePlanCorners({
        imageWidth: 100,
        imageHeight: 0,
        calibrationPairs: [
          { pixel: [0, 0], geo: [-98.5, 39.8] },
          { pixel: [100, 100], geo: [-98.4, 39.7] },
        ],
      }).success
    ).toBe(false);
  });

  it('rejects insufficient calibration pairs', () => {
    const r = computePlanCorners({
      imageWidth: 100,
      imageHeight: 100,
      calibrationPairs: [{ pixel: [0, 0], geo: [-98.5, 39.8] }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('computes corners and bbox from two calibration pairs', () => {
    const pair1 = { pixel: [100, 200], geo: [-98.5, 39.8] };
    const pair2 = { pixel: [400, 300], geo: [-98.4, 39.75] };
    const result = computePlanCorners({
      imageWidth: 500,
      imageHeight: 400,
      calibrationPairs: [pair1, pair2],
    });
    expect(result.success).toBe(true);
    expect(result.corners).toBeDefined();
    expect(result.corners.corner_nw_lat).toBeDefined();
    expect(result.corners.corner_nw_lng).toBeDefined();
    expect(result.corners.corner_ne_lat).toBeDefined();
    expect(result.corners.corner_ne_lng).toBeDefined();
    expect(result.corners.corner_se_lat).toBeDefined();
    expect(result.corners.corner_se_lng).toBeDefined();
    expect(result.corners.corner_sw_lat).toBeDefined();
    expect(result.corners.corner_sw_lng).toBeDefined();
    expect(result.bbox).toBeDefined();
    expect(result.bbox.min_lat).toBeLessThanOrEqual(result.bbox.max_lat);
    expect(result.bbox.min_lng).toBeLessThanOrEqual(result.bbox.max_lng);
    expect(result.cornersForMapLibre).toBeDefined();
    expect(result.cornersForMapLibre.corner_nw).toEqual([
      result.corners.corner_nw_lng,
      result.corners.corner_nw_lat,
    ]);
  });

  it('fails when calibration points are identical', () => {
    const result = computePlanCorners({
      imageWidth: 100,
      imageHeight: 100,
      calibrationPairs: [
        { pixel: [50, 50], geo: [-98.5, 39.8] },
        { pixel: [50, 50], geo: [-98.5, 39.8] },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
