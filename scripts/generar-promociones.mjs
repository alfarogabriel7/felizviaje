/**
 * Feliz Viaje Villa Insurgentes - Promociones propias (se ejecuta al publicar)
 *
 * Recorre cada carpeta de promocion/ (p. ej. promocion/pueblosmagicos) y escribe
 * dentro un lista.json con las imágenes que encuentre, para que el portal las
 * muestre. Una página estática no puede leer el contenido de una carpeta, por
 * eso la lista se genera aquí.
 *
 * Por cada imagen: el título sale del nombre del archivo. Si junto a ella hay un
 * .txt con el mismo nombre, su primera línea es el título y el resto la descripción.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';

const RAIZ = new URL('../promocion/', import.meta.url);
const IMAGEN = /\.(jpe?g|png|webp|gif|avif)$/i;

const sinExt = n => n.replace(/\.[^.]+$/, '');

function tituloDe(archivo) {
  const t = sinExt(archivo).replace(/^\d+[-_ .]*/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || sinExt(archivo);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function listar(carpeta) {
  const dir = new URL(carpeta + '/', RAIZ);
  const archivos = (await readdir(dir, { withFileTypes: true })).filter(f => f.isFile()).map(f => f.name);
  const items = [];
  for (const archivo of archivos.filter(n => IMAGEN.test(n)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
    let titulo = tituloDe(archivo), descripcion = '';
    const txt = archivos.find(n => n.toLowerCase() === (sinExt(archivo) + '.txt').toLowerCase());
    if (txt) {
      const lineas = (await readFile(new URL(txt, dir), 'utf8')).replace(/^﻿/, '').split(/\r?\n/);
      if (lineas[0].trim()) titulo = lineas[0].trim();
      descripcion = lineas.slice(1).join('\n').trim();
    }
    items.push({ archivo, titulo, descripcion });
  }
  await writeFile(new URL('lista.json', dir), JSON.stringify(items, null, 1) + '\n');
  console.log(`promocion/${carpeta}: ${items.length} imagen(es)`);
}

let carpetas = [];
try { carpetas = (await readdir(RAIZ, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name); } catch { /* sin carpeta promocion/ */ }
for (const c of carpetas) await listar(c);
