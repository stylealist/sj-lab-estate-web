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
    // 조회 서버(sj-lab-estate)를 따로 띄워 바로 확인할 때는 대상을 그 포트로 바꾼다.
    //   ESTATE_PROXY_TARGET=http://localhost:8120 npm start
    proxy: {
      "/estate": {
        target: process.env.ESTATE_PROXY_TARGET || "http://localhost:8100",
        changeOrigin: true,
        /*
          **Origin 헤더를 떼고 넘긴다**(2026-11-25). 떼지 않으면 관심 담기·메모가 403 이다.

          브라우저는 같은 오리진이라도 **GET·HEAD 가 아닌 요청에는 Origin 을 붙인다**(규격).
          그래서 프록시를 거쳐도 게이트웨이는 `Origin: http://localhost:4200` 을 받는데,
          게이트웨이의 CORS 허용 목록(`[/**]`)에는 4000 과 운영 도메인만 있어 4200 은 403 이다.
          `changeOrigin` 은 **Host** 만 바꾸고 Origin 은 건드리지 않아 이것을 막지 못한다.

          **이 화면이 쓰기를 처음 하게 된 2026-11-24(회원 기능) 전까지 드러나지 않았다** —
          조회는 전부 GET 이라 Origin 이 아예 붙지 않아 CORS 검사를 타지 않았다.

          프록시가 보내는 것은 실제로 브라우저가 아니라 **dev server 가 서버에서 보내는 요청**
          이므로, Origin 이 없는 것이 사실에 맞다. 게이트웨이에 4200 을 넣는 방법도 있지만
          개발 전용 주소를 운영 설정에 남기지 않으려고 이쪽을 택했다.
          **운영은 영향이 없다** — `https://sj-lab.co.kr` 는 이미 허용 목록에 있다.
        */
        onProxyReq: (proxyReq) => proxyReq.removeHeader("origin"),
      },
    },
  },
  mode: "development",
};
