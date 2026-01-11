/** @type {import('next').NextConfig} */
const nextConfig = {
  // サーバー用パッケージの指定
  serverExternalPackages: ['pdfjs-dist'],

  experimental: {
    serverActions: {
      // 許可するオリジン
      allowedOrigins: ['192.168.10.108:3000', 'localhost:3000'],
      
      // 【修正】ここを 10mb から 50mb に変更します
      bodySizeLimit: '50mb',
    },
  },
  
  // Webpackの設定
  webpack: (config: any) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;