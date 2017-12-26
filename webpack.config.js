const webpack = require('webpack');
const path = require('path');
const rxPaths = require('rxjs/_esm5/path-mapping');
const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const libname = 'queries-scheduler';

const config = {
	entry: './src/index.ts',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'index.bundle.js',
		library: libname,
		libraryTarget: 'umd',
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
	],
	module: {
		rules: [
			{
				test: /\.ts$/,
				loader: 'ts-loader',
				options: { onlyCompileBundledFiles: true, compilerOptions: { outDir: '.' } },
			},
		],
	},
};

module.exports = config;
