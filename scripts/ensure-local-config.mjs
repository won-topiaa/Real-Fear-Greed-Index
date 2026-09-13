// `src/config.local.ts`가 없으면 예시 파일을 복사한다. 있으면 절대 덮어쓰지 않는다.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'config.local.ts');
const example = join(root, 'src', 'config.local.example.ts');

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log('[ensure-local-config] src/config.local.ts 를 예시 파일로 생성했어요 (목 데이터 모드).');
}
