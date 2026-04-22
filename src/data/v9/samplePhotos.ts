// Sample photos served from public/test_images/.
// Aspect ratios baked in (width / height, 4 decimal places) so the Upload
// section can stage samples synchronously without a runtime probe.
// If a file is replaced, re-measure: `sips -g pixelWidth -g pixelHeight <file>`.

export interface SamplePhoto {
  id: string;
  src: string;
  filename: string;
  aspectRatio: number;
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  { id: 'sample-test_002', src: '/test_images/test_002.jpg', filename: 'test_002.jpg', aspectRatio: 0.7628 },
  { id: 'sample-test_004', src: '/test_images/test_004.jpg', filename: 'test_004.jpg', aspectRatio: 0.7506 },
  { id: 'sample-test_005', src: '/test_images/test_005.jpg', filename: 'test_005.jpg', aspectRatio: 0.6650 },
  { id: 'sample-test_006', src: '/test_images/test_006.jpg', filename: 'test_006.jpg', aspectRatio: 1.4998 },
  { id: 'sample-test_007', src: '/test_images/test_007.jpg', filename: 'test_007.jpg', aspectRatio: 1.4998 },
  { id: 'sample-test_008', src: '/test_images/test_008.jpg', filename: 'test_008.jpg', aspectRatio: 0.8024 },
  { id: 'sample-test_009', src: '/test_images/test_009.jpg', filename: 'test_009.jpg', aspectRatio: 1.5002 },
];
