const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const SpriteLoaderPlugin = require('svg-sprite-loader/plugin');

const vendorChunk = new webpack.optimize.CommonsChunkPlugin({
  name: 'vendor',
  minChunks: module => /node_modules/.test(module.resource),
});

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, './dist/'),
    filename: '[name].[hash].js',
  },
  devtool: 'source-map',
  devServer: { port: 9000, hot: true },
  module: {
    rules: [{
      test:    /\.js$/,
      loader:  'babel-loader',
      options: { presets: ['env', 'stage-1', 'react'] },
    },
    {
      test: /\.scss$/,
      use:  [ 'style-loader', 'css-loader', 'sass-loader' ],
    },
    {
      test:    /\.svg$/,
      include: path.resolve('./icons'),
      use: [{
        loader:  'svg-sprite-loader',
        options: { spriteFilename: 'sprite.[hash].svg', esModule: false },
      },
      {
        loader: 'svgo-loader',
      }],
    },
    {
      test:   /\.(eot|woff|woff2|ttf|svg|png|jpe?g|gif)(\?\S*)?$/,
      loader: 'file-loader',
    }],
  },
  plugins: [
    vendorChunk,
    new HtmlWebpackPlugin({ template: 'src/index.html' }),
    new SpriteLoaderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NamedModulesPlugin(),
    new webpack.optimize.CommonsChunkPlugin({ name: 'bundle', minChunks: Infinity }),
    new webpack.optimize.ModuleConcatenationPlugin(),
  ],
};
