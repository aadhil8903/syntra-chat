module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setup-jest.ts'],
  moduleNameMapper: {
    '^@enter-chat/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^marked$': '<rootDir>/../../node_modules/marked/lib/marked.umd.js',
    '^jspdf$': '<rootDir>/../../node_modules/jspdf/dist/jspdf.node.min.js',
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(ts|js|mjs|html)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/main.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
};
