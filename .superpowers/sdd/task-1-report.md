# Task 1 Report: 测试基础设施 + 3 个失败测试

## Status: DONE

## Commits Made

| Hash | Message |
|------|---------|
| `8f38ce4` | test: add Vitest setup + 3 failing tests for TeachingDocPanel |

## Files Created

- `frontend/vitest.config.ts` -- Vitest config with jsdom environment, React plugin, and test setup file
- `frontend/src/test/setup.ts` -- Global test setup importing `@testing-library/jest-dom`
- `frontend/src/components/TeachingDocPanel.tsx` -- Minimal stub component with full props interface (forwardRef, all 7 props)
- `frontend/src/components/__tests__/TeachingDocPanel.test.tsx` -- 3 TDD tests expecting failure

## Files Modified

- `frontend/package.json` -- Added `"test": "vitest run"` and `"test:watch": "vitest"` scripts
- `frontend/package-lock.json` -- Updated by npm install

## Test Results

Command: `npx vitest run`

```
 RUN  v4.1.9 D:/YISHAOAGENT/frontend

 ❯ src/components/__tests__/TeachingDocPanel.test.tsx (3 tests | 3 failed) 77ms
     × 生成按钮独立 — 点击生成不影响其他按钮状态 18ms
     × 空内容时保存按钮不显示"已保存" 2ms
     × 修改模型选择器不影响其他 Panel 的模型值 56ms
```

All 3 tests FAIL as expected. The stub component renders only `<div>TeachingDocPanel stub</div>`, so all queries (AI 生成, 保存, 大模型 combobox) correctly fail.

## Build Result

Command: `npm run build`

```
> tsc && vite build
vite v5.4.21 building for production...
✓ 44 modules transformed.
✓ built in 680ms
```

Build passes cleanly. No existing code was modified.

## Concerns / Notes

1. No business code was modified. Only new files created and package.json scripts added.
2. The `@testing-library/jest-dom` version installed is `^6.9.1` and `@testing-library/react` is `^16.3.2` -- these are compatible with the existing React 18 setup.
3. Vitest v4.1.9 was installed, which is the latest stable release matching the existing Vite 5.4 setup.
4. All 3 tests fail with `TestingLibraryElementError` as expected for a stub component -- proving the test infrastructure works and the tests are meaningful.
