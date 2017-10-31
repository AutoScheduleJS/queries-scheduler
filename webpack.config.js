const path = require('path');
const TypedocWebpackPlugin = require('typedoc-webpack-plugin');

const config = {
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.bundle.js',
  },
  resolve: {
    extensions: [".js", ".ts", ".json"],
  },
  devtool: 'cheap-module-eval-source-map',
  plugins: [
    new TypedocWebpackPlugin({
      out: '../docs',
      mode: 'modules',
      module: 'commonjs',
      target: 'ES2015',
      name: 'Query Scheduler',
      readme: '../README.md',
    }),
  ],
  module: {
    loaders: [
            { test: /\.ts$/, loader: "ts-loader" }
        ]
  }
};

module.exports = config;
