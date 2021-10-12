import './dotenv.js';
import http from 'http';
import { createApi } from 'unsplash-js';
import nodeFetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream';
import { promisify } from 'util';
import sharp from 'sharp';
import imageSize from 'image-size';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const unsplash = createApi({
  accessKey: process.env.MY_ACCESS_KEY,
  fetch: nodeFetch,
});

async function searchImage(query) {
  const result = await unsplash.search.getPhotos({ query });

  const image = result.response.results[0];

  if (!image) {
    throw new Error('Failed to search image.');
  }

  return {
    description: image.description || image.alt_description,
    url: image.urls.regular,
  };
}

async function getCachedImageOrSearchedImage(query) {
  const imageFilePath = path.resolve(__dirname, `../images/${query}`);
  const size = imageSize(imageFilePath);

  if (fs.existsSync(imageFilePath)) {
    return {
      message: `Returning cached image : ${query}, width : ${size.width}, height : ${size.height}`,
      stream: fs.createReadStream(imageFilePath),
    };
  }

  const result = await searchImage(query);
  const resp = await nodeFetch(result.url);

  await promisify(pipeline)(resp.body, fs.createWriteStream(imageFilePath));

  return {
    message: `Returning new image : ${query}, width : ${size.width}, height : ${size.height}`,
    stream: fs.createReadStream(imageFilePath),
  };
}

function convertURLToImageInfo(url) {
  const urlObj = new URL(url, 'http://localhost:5000');

  function getSearchParam(name, defaultValue) {
    const str = urlObj.searchParams.get(name);
    return str ? parseInt(str, 10) : defaultValue;
  }

  const width = getSearchParam('width', 400);
  const height = getSearchParam('height', 400);

  return {
    query: urlObj.pathname.slice(1),
    width,
    height,
  };
}

const server = http.createServer((req, res) => {
  if (!req.url.includes('favicon.ico')) {
    async function main() {
      if (!req.url) {
        res.statusCode = 400;
        res.end('Needs URL.');
        return;
      }

      const { query, width, height } = convertURLToImageInfo(req.url);
      try {
        const { message, stream } = await getCachedImageOrSearchedImage(query);
        console.log(message);
        await promisify(pipeline)(
          stream,
          sharp()
            .resize(width, height, {
              fit: 'contain',
              background: '#fff',
            })
            .png(),
          res
        );
      } catch (err) {
        console.error(err);
      }
    }

    main();
  } else {
    return;
  }
});

server.listen(process.env.PORT, () => {
  console.log('The server is listening at port', process.env.PORT);
});
