const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/optimizer/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9100,
    open: true,
    client: { overlay: { errors: true, warnings: false } },
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'index.html'), to: 'index.html' },
        { from: path.resolve(__dirname, 'styles.css'), to: 'styles.css' },
        { from: path.resolve(__dirname, 'simulator/locales'), to: 'locales' },
        { from: path.resolve(__dirname, 'simulator/js'), to: 'js' },
        { from: path.resolve(__dirname, 'simulator/patchNote.json'), to: 'patchNote.json' },
        { from: path.resolve(__dirname, 'simulator/combatsimulator/data'), to: 'combatsimulator/data' },
      ],
    }),
  ],
};
