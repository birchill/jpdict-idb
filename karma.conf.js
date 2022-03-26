const path = require('path');
const webpack = require('webpack');

module.exports = (config) => {
  config.set({
    files: [{ pattern: 'src/**/*.test.ts', watched: false }],
    preprocessors: {
      '**/*.test.ts': ['webpack'],
    },
    frameworks: ['mocha', 'chai', 'webpack'],
    browsers: ['FirefoxHeadless', 'ChromeHeadless'],
    plugins: [
      require('karma-mocha'),
      require('karma-chai'),
      require('karma-webpack'),
      require('karma-firefox-launcher'),
      require('karma-chrome-launcher'),
    ],
    webpack: {
      mode: 'development',
      resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
          util: require.resolve('util/'),
        },
      },
      resolveLoader: {
        modules: [path.join(__dirname, 'node_modules')],
      },
      module: {
        rules: [{ test: /\.ts$/, use: 'ts-loader' }],
      },
      plugins: [
        new webpack.ProvidePlugin({
          process: 'process/browser.js',
        }),
      ],
    },
  });
};
