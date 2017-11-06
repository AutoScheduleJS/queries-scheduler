const webpack = require('webpack');
const path = require('path');
const TypedocWebpackPlugin = require('typedoc-webpack-plugin');
const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const rxPaths = require('rxjs/_esm5/path-mapping');

const config = {
	entry: './src/index.ts',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'index.bundle.js',
	},
	resolve: {
		extensions: ['.js', '.ts', '.json'],
		alias: rxPaths(),
	},
	devtool: isProd ? 'hidden-source-map' : 'cheap-module-eval-source-map',
	plugins: [
		new webpack.DefinePlugin({
			'process.env': {
				NODE_ENV: JSON.stringify(nodeEnv),
			},
		}),
		new webpack.optimize.ModuleConcatenationPlugin(),
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
		loaders: [{ test: /\.ts$/, loader: 'ts-loader' }],
	},
};

module.exports = config;
