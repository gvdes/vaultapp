
import { supabase, isSupabaseConfigured } from '../supabase'

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function upload(bucket, folder, file) {
  if (!isSupabaseConfigured || !supabase) {
    return readAsDataUrl(file)
  }

  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false })

  if (error) throw error

  return supabase.storage
    .from(bucket)
    .getPublicUrl(data?.path ?? path)
    .data.publicUrl
}

export function uploadFoto(folder, file) {
  return upload('inventario-fotos', folder, file)
}

export function uploadFactura(folder, file) {
  return upload('inventario-facturas', folder, file)
}

export function uploadResponsiva(folder, file) {
  return upload('inventario-responsivas', folder, file)
}

/**
 * Convierte una URL de S3 o Laravel a la ruta de descarga
 * autenticada de Laravel.
 */
function obtenerUrlLaravel(url) {
  const base = String(supabase.baseUrl).replace(/\/+$/, '')
  const origen = new URL(url, window.location.origin)

  let ruta = origen.pathname

  // Si viene de S3, quitar el prefijo /dga/
  const prefijoS3 = '/dga/'

  if (origen.hostname.includes('amazonaws.com')) {
    const posicion = ruta.indexOf(prefijoS3)

    if (posicion === -1) {
      throw new Error('La ruta del archivo S3 no tiene el prefijo esperado.')
    }

    ruta = ruta.substring(posicion + prefijoS3.length)
  } else {
    // Si ya viene de Laravel, conservar la ruta después de /storage/
    const posicion = ruta.indexOf('/storage/')

    if (posicion !== -1) {
      ruta = ruta.substring(posicion + '/storage/'.length)
    }
  }

  return `${base}/storage/${ruta.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Descarga un documento privado mediante Laravel y el token
 * de autenticación de la aplicación.
 */
export async function abrirDocumentoPrivado(url) {
  if (!supabase || !url) {
    throw new Error('No hay una sesión o URL disponible.')
  }

  const { data, error } = await supabase.auth.getSession()

  const token = data?.session?.access_token

  if (error || !token) {
    throw new Error('La sesión expiró. Inicia sesión nuevamente.')
  }

  const urlLaravel = obtenerUrlLaravel(url)

  const respuesta = await fetch(urlLaravel, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*',
    },
  })

  if (!respuesta.ok) {
    throw new Error(
      respuesta.status === 401
        ? 'Tu sesión expiró. Inicia sesión nuevamente.'
        : respuesta.status === 403
          ? 'No tienes permiso para consultar este documento.'
          : respuesta.status === 404
            ? 'No se encontró el documento.'
            : `No se pudo descargar el documento. Error ${respuesta.status}.`
    )
  }

  const archivo = await respuesta.blob()

  return URL.createObjectURL(archivo)
}
