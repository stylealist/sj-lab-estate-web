const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "build"),
    filename: "bundle.js",
    // 운영은 sj-lab.co.kr/estate/ 하위에서 서빙되므로 상대 경로로 뽑는다.
    publicPath: "",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/index.html",
      favicon: "./public/favicon.svg",
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, "public"),
    },
    port: 4200,
    open: true,
    hot: true,
    historyApiFallback: true,
    // 로컬에서는 API 호출을 게이트웨이(8100)로 넘긴다. 같은 오리진으로 부르는 셈이라
    // CORS 설정이 필요 없다(sj-lab-openapi-web 과 같은 방식).
    // fast-api-ai 를 따로 띄워 바로 확인할 때는 대상을 8000 으로 바꿀 수 있다.
    //   ESTATE_PROXY_TARGET=http://localhost:8000 npm start
    proxy: {
      "/fast-api-ai": {
        target: process.env.ESTATE_PROXY_TARGET || "http://localhost:8100",
        changeOrigin: true,
      },
    },
  },
  mode: "development",
};
