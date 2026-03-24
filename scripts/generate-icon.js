const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const size = 256;
const png = new PNG({ width: size, height: size });

function fillRect(x, y, width, height, rgba) {
  for (let iy = y; iy < y + height; iy += 1) {
    for (let ix = x; ix < x + width; ix += 1) {
      const idx = (png.width * iy + ix) << 2;
      png.data[idx] = rgba[0];
      png.data[idx + 1] = rgba[1];
      png.data[idx + 2] = rgba[2];
      png.data[idx + 3] = rgba[3];
    }
  }
}

function fillCircle(cx, cy, radius, rgba) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = rgba[0];
        png.data[idx + 1] = rgba[1];
        png.data[idx + 2] = rgba[2];
        png.data[idx + 3] = rgba[3];
      }
    }
  }
}

function drawLine(x1, y1, x2, y2, thickness, rgba) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);
      const distance = Math.hypot(x - px, y - py);
      if (distance <= thickness) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = rgba[0];
        png.data[idx + 1] = rgba[1];
        png.data[idx + 2] = rgba[2];
        png.data[idx + 3] = rgba[3];
      }
    }
  }
}

fillRect(0, 0, size, size, [15, 123, 108, 255]);
fillCircle(80, 128, 28, [247, 241, 234, 255]);
fillCircle(176, 76, 28, [247, 241, 234, 255]);
fillCircle(176, 180, 28, [247, 241, 234, 255]);
drawLine(102, 120, 152, 90, 8, [247, 241, 234, 255]);
drawLine(102, 136, 152, 166, 8, [247, 241, 234, 255]);

const target = path.join(__dirname, "..", "public", "favicon.png");
const buffer = PNG.sync.write(png);
fs.writeFileSync(target, buffer);
