import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        australia: path.resolve(__dirname, 'australia.html'),
        canada: path.resolve(__dirname, 'canada.html'),
        uk: path.resolve(__dirname, 'uk.html'),
        usa: path.resolve(__dirname, 'usa.html'),
        newzealand: path.resolve(__dirname, 'newzealand.html'),
        europe: path.resolve(__dirname, 'europe.html'),
        team: path.resolve(__dirname, 'team.html'),
        missionVision: path.resolve(__dirname, 'mission-vision.html'),
        privacy: path.resolve(__dirname, 'privacy.html'),
        terms: path.resolve(__dirname, 'terms.html'),
      },
    },
  },
});
