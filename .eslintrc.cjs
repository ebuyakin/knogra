module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // A leading underscore marks a deliberately unused argument or variable,
    // the latter for `const { dropped: _dropped, ...rest } = obj`.
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Technical debt, recorded 2026-09-27 when lint first ran on the codebase:
      // these files carried 95 explicit `any`s between them. The rule stays on
      // everywhere else, and for every new file. Clean a file's `any`s when a
      // task takes you into it, then delete it from this list; when the list
      // is empty, delete the override.
      files: [
        'src/config/debug-flags.ts',
        'src/events/event-bus.ts',
        'src/features/autolayout/autolayout.ts',
        'src/features/graph/graph.ts',
        'src/features/scene/collapse-animator.ts',
        'src/features/scene/edge-ops.ts',
        'src/features/scene/elements.ts',
        'src/features/scene/expand-animator.ts',
        'src/features/scene/fold-manager.ts',
        'src/features/scene/node-ops.ts',
        'src/features/scene/scene.ts',
        'src/features/transition/fold-state-handler.ts',
        'src/features/transition/opening-closing/open-close-orchestrator.ts',
        'src/features/transition/opening-closing/open-scene-animator.ts',
        'src/features/transition/scene-to-scene/arrival-fly-in.ts',
        'src/features/transition/scene-to-scene/morphing-parallel.ts',
        'src/features/transition/scene-to-scene/morphing/ghost-operator.ts',
        'src/features/transition/scene-to-scene/morphing/transition-analysis-operator.ts',
        'src/features/transition/scene-to-scene/scene-to-scene-orchestrator.ts',
        'src/features/transition/transition.ts',
        'src/storage/graph-saver.ts',
        'src/styles/style-generator.ts',
        'src/ui/components/background-editor.ts',
        'src/ui/components/ui-component-api.ts',
        'src/utils/mathjax.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
}
