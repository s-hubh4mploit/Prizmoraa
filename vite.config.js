import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        collection: resolve(__dirname, 'collection.html'),
        collections: resolve(__dirname, 'collections.html'),
        product: resolve(__dirname, 'product.html'),
        contact: resolve(__dirname, 'contact.html'),
        checkout: resolve(__dirname, 'checkout.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
});
