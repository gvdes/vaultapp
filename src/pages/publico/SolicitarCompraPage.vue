<template>
  <PublicShell activo="nueva" ancho="normal" :con-barra-inferior="!!datos && !resultado">
    <!-- Cargando -->
    <div v-if="cargando" class="flex flex-col gap-4" role="status" aria-live="polite" aria-label="Cargando el formulario">
      <SkeletonBlock cls="h-9 w-64" />
      <SkeletonBlock cls="h-4 w-full max-w-md" />
      <div v-for="i in 3" :key="i" :class="`${tarjeta} flex flex-col gap-3`">
        <SkeletonBlock cls="h-5 w-48" />
        <SkeletonBlock cls="h-11 w-full" />
        <SkeletonBlock cls="h-11 w-full" />
      </div>
    </div>

    <!-- Error de carga -->
    <div v-else-if="errorCarga" :class="`${tarjeta} mx-auto mt-6 max-w-lg text-center`" role="alert">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-vz-danger/10 text-vz-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-6 w-6" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 class="text-[17px] font-extrabold text-text">No pudimos abrir el formulario</h1>
      <p class="mt-1 text-[13px] text-text-muted">{{ errorCarga }}</p>
      <button type="button" :class="`${btnPrimario} mt-4`" @click="cargar">Reintentar</button>
    </div>

    <!-- Éxito -->
    <div v-else-if="resultado" class="mx-auto flex max-w-xl flex-col gap-4">
      <div :class="`${tarjeta} text-center`">
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-vz-success/15 text-vz-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-7 w-7" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 ref="tituloExito" tabindex="-1" class="text-[20px] font-extrabold text-text outline-none">¡Requisición enviada!</h1>
        <p class="mt-1 text-[13.5px] text-text-muted">Este es tu folio. Guárdalo: con él consultas el avance.</p>
        <p class="mt-3 select-all break-all rounded-2xl bg-vz-blue/10 px-4 py-4 text-[26px] font-extrabold leading-tight tracking-tight text-vz-blue sm:text-[32px]" aria-label="Folio">{{ resultado.folio }}</p>
        <p class="mt-3 text-[14px] font-semibold text-text">Te avisaremos por correo en cada cambio.</p>
        <p class="mt-0.5 text-[12.5px] text-text-muted">Los avisos llegan al correo que Adquisiciones tiene registrado para ti.</p>
      </div>

      <div :class="tarjeta">
        <h2 class="text-[15px] font-extrabold text-text">Tu liga personal de seguimiento</h2>
        <p class="mt-0.5 text-[12.5px] text-text-muted">Solo quien tenga esta liga puede ver el avance. Compártela solo con quien quieras.</p>
        <div class="mt-3 break-all rounded-xl border border-border bg-bg px-3 py-2.5 text-[12.5px] text-text-muted" data-testid="liga-seguimiento">{{ ligaSeguimiento }}</div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <button type="button" :class="btnSecundario" @click="copiarLiga">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
            {{ copiado ? '¡Liga copiada!' : 'Copiar liga' }}
          </button>
          <a :href="urlWhatsApp(textoWhatsApp)" target="_blank" rel="noopener noreferrer" :class="`${btnSecundario} border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10 dark:text-[#4ade80]`">
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true">
              <path d="M17.5 14.4c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.91-2.2-.24-.57-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.8a9.9 9.9 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.88 9.88 0 01-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89a9.83 9.83 0 016.99 2.9 9.82 9.82 0 012.9 6.99c0 5.46-4.44 9.9-9.9 9.9zM20.5 3.5A11.8 11.8 0 0012.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 005.68 1.45h.01c6.55 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.5-8.4z" />
            </svg>
            Compartir por WhatsApp
          </a>
        </div>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row">
        <button type="button" :class="`${btnPrimario} flex-1`" @click="verSeguimiento">Ver el seguimiento</button>
        <button type="button" :class="`${btnSecundario} flex-1`" @click="otraRequisicion">Hacer otra requisición</button>
      </div>
    </div>

    <!-- Formulario -->
    <form v-else-if="datos" class="flex flex-col gap-4" novalidate @submit.prevent="revisar">
      <div class="pb-1">
        <h1 class="text-[24px] font-extrabold leading-tight text-text sm:text-[28px]">Nueva requisición</h1>
        <p class="mt-1 max-w-xl text-[14px] leading-snug text-text-muted">
          Pide lo que necesitas en un par de minutos. Adquisiciones cotiza, Finanzas autoriza y tú sigues el avance por correo.
        </p>
        <p class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] font-semibold text-text-muted ring-1 ring-border">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          La fecha y hora se registran solas al enviar
        </p>
      </div>

      <!-- Borrador recuperado -->
      <div v-if="borradorRecuperado" class="flex flex-wrap items-center gap-3 rounded-2xl border border-vz-blue/30 bg-vz-blue/10 px-4 py-3" role="status">
        <p class="min-w-0 flex-1 text-[13px] font-semibold text-text">Recuperamos lo que tenías capturado. Revísalo y envíalo cuando quieras.</p>
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-bold text-text hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-vz-blue" @click="empezarDeNuevo">Empezar de nuevo</button>
      </div>

      <!-- Resumen de errores -->
      <div v-if="intento && errores.lista.length" ref="bloqueErrores" tabindex="-1" class="rounded-2xl border border-vz-danger/40 bg-vz-danger/5 p-4 outline-none" role="alert">
        <p class="text-[14px] font-extrabold text-vz-danger">Falta completar {{ errores.lista.length }} {{ errores.lista.length === 1 ? 'dato' : 'datos' }} para enviar</p>
        <ul class="mt-2 flex flex-col gap-1">
          <li v-for="(x, i) in errores.lista" :key="i">
            <button type="button" class="text-left text-[13px] font-semibold text-text underline decoration-vz-danger/50 underline-offset-2 hover:text-vz-danger focus-visible:outline-2 focus-visible:outline-vz-danger" @click="saltarA(x.id)">{{ x.msg }}</button>
          </li>
        </ul>
      </div>

      <!-- 1. Solicitante -->
      <PasoCard :numero="1" titulo="¿Quién solicita?" subtitulo="Elige tu nombre. Tus avisos llegan al correo que Adquisiciones tiene registrado para ti; no hace falta escribirlo.">
        <div class="grid gap-3.5 sm:grid-cols-2">
          <CampoForm label="Solicitante" for-id="f-solicitante" required :error="ver(errores.solicitante)">
            <ComboBox id="f-solicitante" v-model="f.solicitanteId" :items="itemsSolicitantes" placeholder="Selecciona quién solicita" :invalido="!!ver(errores.solicitante)" text-vacio="No encontramos ese nombre" :describedby="errores.solicitante && intento ? 'f-solicitante-err' : undefined" />
          </CampoForm>
          <CampoForm label="Área" for-id="f-area" hint="Se llena sola con tu nombre.">
            <input id="f-area" :value="solicitante?.area ?? ''" readonly tabindex="-1" :class="`${inp} cursor-not-allowed bg-surface-hover text-text-muted`" :placeholder="solicitante ? 'Sin área registrada' : 'Elige primero tu nombre'" />
          </CampoForm>
        </div>
        <div class="mt-3">
          <button type="button" class="h-9 rounded-lg px-1 text-[13px] font-bold text-vz-blue focus-visible:outline-2 focus-visible:outline-vz-blue" :aria-expanded="faltaEnLista" aria-controls="no-estoy" @click="faltaEnLista = !faltaEnLista">
            ¿No estoy en la lista?
          </button>
          <div v-show="faltaEnLista" id="no-estoy" class="mt-2 rounded-xl border border-border bg-bg p-3.5">
            <p class="text-[13px] leading-snug text-text-muted">
              Para cuidar el control de compras, solo quienes están en el directorio pueden levantar requisiciones. Escribe tus datos y envíaselos a Adquisiciones para que te den de alta; después vuelves aquí.
            </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-3">
              <CampoForm label="Nombre" for-id="ne-nombre"><input id="ne-nombre" v-model="alta.nombre" :class="inp" autocomplete="name" /></CampoForm>
              <CampoForm label="Área" for-id="ne-area"><input id="ne-area" v-model="alta.area" :class="inp" /></CampoForm>
              <CampoForm label="Tu correo" for-id="ne-correo"><input id="ne-correo" v-model="alta.correo" type="email" inputmode="email" autocomplete="email" :class="inp" /></CampoForm>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" :class="btnSecundario" :disabled="!altaLista" @click="copiarAlta">{{ altaCopiada ? '¡Copiado!' : 'Copiar mensaje' }}</button>
              <a :href="altaLista ? urlWhatsApp(mensajeAlta) : undefined" target="_blank" rel="noopener noreferrer" :aria-disabled="!altaLista" :class="`${btnSecundario} ${altaLista ? '' : 'pointer-events-none opacity-55'}`">Enviar por WhatsApp</a>
            </div>
          </div>
        </div>
      </PasoCard>

      <!-- 2. Dónde y cuándo -->
      <PasoCard :numero="2" titulo="¿Dónde y para cuándo?" subtitulo="Elige a qué sucursal(es) se carga la compra y qué tan pronto la necesitas.">
        <div id="f-ubicaciones" tabindex="-1" class="outline-none">
          <p class="mb-2 text-[13px] font-bold text-text">Sucursal(es) <span class="text-vz-danger" aria-hidden="true">*</span></p>
          <div class="mb-3 flex flex-wrap gap-2">
            <button type="button" :class="`${chip(todasActivo)}`" :aria-pressed="todasActivo" @click="alternarTodas">Todas las sucursales</button>
            <button type="button" :class="`${chip(f.modo === 'general')}`" :aria-pressed="f.modo === 'general'" @click="alternarGeneral">General (ninguna sucursal)</button>
          </div>

          <div v-if="f.modo === 'general'" class="rounded-xl border border-border bg-bg p-3.5">
            <p class="mb-2 text-[12.5px] leading-snug text-text-muted">Esta compra no se carga a ninguna sucursal. Solo dinos dónde se entrega.</p>
            <CampoForm label="¿Dónde se entrega?" for-id="f-entrega" required :error="ver(errores.entrega)">
              <select id="f-entrega" v-model="f.entregaId" :class="`${inp} ${ver(errores.entrega) ? inpError : ''}`">
                <option value="">Elige un lugar…</option>
                <optgroup v-for="g in grupos" :key="g.tipo" :label="g.titulo">
                  <option v-for="u in g.items" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                </optgroup>
              </select>
            </CampoForm>
          </div>

          <div v-else class="flex flex-col gap-3">
            <fieldset v-for="g in grupos" :key="g.tipo" class="m-0 min-w-0 border-0 p-0">
              <legend class="mb-1.5 text-[11.5px] font-extrabold uppercase tracking-wider text-text-soft">{{ g.titulo }}</legend>
              <div class="flex flex-wrap gap-2">
                <button v-for="u in g.items" :key="u.id" type="button" :class="chip(f.ubicaciones.includes(u.id))" :aria-pressed="f.ubicaciones.includes(u.id)" @click="alternarUbicacion(u.id)">
                  <svg v-if="f.ubicaciones.includes(u.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="h-3.5 w-3.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  {{ u.nombre }}
                </button>
              </div>
            </fieldset>
          </div>
          <p v-if="f.modo === 'lista'" class="mt-2 text-[12.5px] text-text-muted" aria-live="polite">
            {{ f.ubicaciones.length === 0 ? 'Toca una o varias para seleccionarlas.' : `${f.ubicaciones.length} seleccionada${f.ubicaciones.length === 1 ? '' : 's'} (máximo ${MAX_UBICACIONES}).` }}
          </p>
          <p v-if="ver(errores.ubicaciones)" role="alert" class="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-semibold text-vz-danger">{{ errores.ubicaciones }}</p>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p class="mb-2 text-[13px] font-bold text-text" id="urg-label">Urgencia</p>
            <div role="radiogroup" aria-labelledby="urg-label" class="grid grid-cols-2 gap-2">
              <label class="relative cursor-pointer">
                <input v-model="f.urgencia" type="radio" name="urgencia" value="normal" class="peer sr-only" />
                <span class="flex h-full flex-col gap-0.5 rounded-xl border-2 border-border bg-bg p-3 transition-colors peer-checked:border-vz-blue peer-checked:bg-vz-blue/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-vz-blue">
                  <span class="text-[14px] font-extrabold text-text">Normal</span>
                  <span class="text-[12px] leading-snug text-text-muted">Sigue el proceso habitual.</span>
                </span>
              </label>
              <label class="relative cursor-pointer">
                <input v-model="f.urgencia" type="radio" name="urgencia" value="urgente" class="peer sr-only" />
                <span class="flex h-full flex-col gap-0.5 rounded-xl border-2 border-border bg-bg p-3 transition-colors peer-checked:border-vz-danger peer-checked:bg-vz-danger/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-vz-danger">
                  <span class="text-[14px] font-extrabold text-text">Urgente</span>
                  <span class="text-[12px] leading-snug text-text-muted">Se atiende primero; cuéntanos por qué.</span>
                </span>
              </label>
            </div>
          </div>

          <CampoForm label="¿Para cuándo la necesitas?" for-id="f-fecha" :required="f.urgencia === 'urgente'" :opcional="f.urgencia !== 'urgente'" :error="ver(errores.fecha)">
            <input id="f-fecha" v-model="f.fechaRequerida" type="date" :min="hoy" :class="`${inp} ${ver(errores.fecha) ? inpError : ''}`" />
            <div class="flex flex-wrap gap-1.5">
              <button v-for="a in atajosFecha" :key="a.texto" type="button" class="h-8 rounded-full border border-border bg-bg px-3 text-[12px] font-bold text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-vz-blue" @click="f.fechaRequerida = a.valor">{{ a.texto }}</button>
              <button v-if="f.fechaRequerida" type="button" class="h-8 rounded-full px-2 text-[12px] font-bold text-text-soft hover:text-vz-danger focus-visible:outline-2 focus-visible:outline-vz-blue" @click="f.fechaRequerida = ''">Quitar fecha</button>
            </div>
          </CampoForm>

          <CampoForm v-if="f.urgencia === 'urgente'" label="¿Por qué es urgente?" for-id="f-motivo" required :error="ver(errores.motivo)" cls="sm:col-span-2" hint="Una frase corta basta. Ej. «Se acabó en caja y hay clientes esperando».">
            <input id="f-motivo" v-model="f.motivoUrgencia" maxlength="200" :class="`${inp} ${ver(errores.motivo) ? inpError : ''}`" placeholder="Motivo de la urgencia" />
          </CampoForm>

          <CampoForm v-if="hayTI" label="¿Para quién es la compra?" for-id="f-paraquien" required :error="ver(errores.paraQuien)" cls="sm:col-span-2" hint="Es compra de tecnología: indica la persona, área o sucursal que lo va a usar para dar de alta el equipo correctamente.">
            <input id="f-paraquien" v-model="f.paraQuien" maxlength="160" :class="`${inp} ${ver(errores.paraQuien) ? inpError : ''}`" placeholder="Ej. Nuevo ejecutivo de ventas, sucursal Bolivia" />
          </CampoForm>

          <CampoForm label="Nota para Adquisiciones" for-id="f-notas" opcional cls="sm:col-span-2">
            <textarea id="f-notas" v-model="f.notas" rows="2" maxlength="400" :class="area" placeholder="Algo más que deban saber (horarios de entrega, a quién preguntar…)" />
          </CampoForm>
        </div>
      </PasoCard>

      <!-- 3. Partidas -->
      <PasoCard :numero="3" titulo="¿Qué necesitas?" :subtitulo="`Agrega cada producto como una partida (hasta ${MAX_PARTIDAS}).`">
        <div id="f-partidas" tabindex="-1" class="flex flex-col gap-3.5 outline-none">
          <PartidaCard
            v-for="(p, i) in f.partidas"
            :key="p.uid"
            :partida="p"
            :indice="i"
            :categorias="categorias"
            :catalogo-items="itemsCatalogo"
            :catalogo="datos.catalogo"
            :lugares="lugares"
            :errores="errores.partidas[p.uid]"
            :mostrar-errores="intento"
            :avisos="avisosDe(i + 1)"
            :puede-quitar="f.partidas.length > 1"
            @quitar="quitarPartida(p.uid)"
            @descartar-aviso="descartados.add($event)"
          />
        </div>
        <p v-if="ver(errores.partidasGeneral)" role="alert" class="mt-2 text-[12.5px] font-semibold text-vz-danger">{{ errores.partidasGeneral }}</p>
        <button type="button" :class="`${btnSecundario} mt-3.5 w-full border-dashed`" :disabled="f.partidas.length >= MAX_PARTIDAS" @click="agregarPartida">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
          {{ f.partidas.length >= MAX_PARTIDAS ? `Llegaste al máximo de ${MAX_PARTIDAS} productos` : 'Agregar otro producto' }}
        </button>
      </PasoCard>

      <!-- 4. Proveedores sugeridos -->
      <PasoCard titulo="Proveedores sugeridos" subtitulo="Opcional. Si ya sabes dónde conviene comprar, cuéntanos; Adquisiciones decide con las cotizaciones.">
        <template #accion>
          <button type="button" class="h-9 shrink-0 rounded-lg border border-border px-3 text-[12.5px] font-bold text-vz-blue hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-vz-blue" :aria-expanded="proveedoresAbiertos" aria-controls="bloque-proveedores" @click="alternarProveedores">
            {{ proveedoresAbiertos ? 'Ocultar' : 'Agregar' }}
          </button>
        </template>
        <div v-show="proveedoresAbiertos" id="bloque-proveedores" class="flex flex-col gap-3">
          <div v-for="(pv, i) in f.proveedores" :id="`pv-${i}`" :key="i" class="rounded-xl border border-border bg-bg p-3.5">
            <div class="mb-2 flex items-center justify-between">
              <p class="text-[13px] font-extrabold text-text">Proveedor {{ i + 1 }}</p>
              <button type="button" class="h-8 rounded-lg px-2 text-[12px] font-bold text-text-muted hover:bg-vz-danger/10 hover:text-vz-danger focus-visible:outline-2 focus-visible:outline-vz-danger" @click="f.proveedores.splice(i, 1)">Quitar</button>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <CampoForm label="Empresa" :for-id="`pv-${i}-e`" :error="ver(errores.proveedores[i])"><input :id="`pv-${i}-e`" v-model="pv.empresa" maxlength="120" :class="`${inp} ${ver(errores.proveedores[i]) ? inpError : ''}`" /></CampoForm>
              <CampoForm label="Contacto" :for-id="`pv-${i}-c`" opcional><input :id="`pv-${i}-c`" v-model="pv.contacto" maxlength="120" :class="inp" /></CampoForm>
              <CampoForm label="Teléfono" :for-id="`pv-${i}-t`" opcional><input :id="`pv-${i}-t`" v-model="pv.telefono" type="tel" inputmode="tel" maxlength="40" :class="inp" /></CampoForm>
              <CampoForm label="Dirección" :for-id="`pv-${i}-d`" opcional><input :id="`pv-${i}-d`" v-model="pv.direccion" maxlength="200" :class="inp" /></CampoForm>
            </div>
          </div>
          <button type="button" :class="`${btnSecundario} border-dashed`" :disabled="f.proveedores.length >= 3" @click="f.proveedores.push(nuevoProveedor())">
            {{ f.proveedores.length >= 3 ? 'Máximo 3 proveedores' : f.proveedores.length ? 'Agregar otro proveedor' : 'Agregar un proveedor' }}
          </button>
        </div>
      </PasoCard>
    </form>

    <!-- Barra fija -->
    <div v-if="datos && !resultado && !cargando && !errorCarga" class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur">
      <div class="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1 leading-tight" aria-live="polite">
          <p class="truncate text-[14px] font-extrabold text-text">{{ f.partidas.length }} {{ f.partidas.length === 1 ? 'producto' : 'productos' }} · {{ totalPiezas }} {{ totalPiezas === 1 ? 'pieza' : 'piezas' }}</p>
          <p :class="`truncate text-[12px] ${intento && errores.lista.length ? 'font-bold text-vz-danger' : 'text-text-muted'}`">
            <template v-if="intento && errores.lista.length">{{ errores.lista.length === 1 ? 'Falta 1 dato' : `Faltan ${errores.lista.length} datos` }} por completar</template>
            <template v-else-if="f.urgencia === 'urgente'">Marcada como URGENTE</template>
            <template v-else>Revisa y envía cuando estés listo</template>
          </p>
        </div>
        <button type="button" :class="`${btnPrimario} shrink-0`" :disabled="enviando" @click="revisar">Enviar requisición</button>
      </div>
    </div>

    <!-- Confirmación -->
    <AppModal v-if="confirmando" title="Confirma tu requisición" wide @close="cerrarConfirmacion">
      <div class="flex flex-col gap-3 text-[13.5px]">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt class="text-text-muted">Solicita</dt>
          <dd class="font-bold text-text">{{ solicitante?.nombre }}<span v-if="solicitante?.area" class="font-normal text-text-muted"> · {{ solicitante.area }}</span></dd>
          <dt class="text-text-muted">Se carga a</dt>
          <dd class="font-bold text-text">{{ f.modo === 'general' ? `Ninguna sucursal (compra general; se entrega en ${nombreUbic(f.entregaId)})` : lugares.map((l) => l.nombre).join(', ') }}</dd>
          <dt class="text-text-muted">Urgencia</dt>
          <dd :class="`font-bold ${f.urgencia === 'urgente' ? 'text-vz-danger' : 'text-text'}`">{{ f.urgencia === 'urgente' ? `URGENTE · ${f.motivoUrgencia.trim()}` : 'Normal' }}</dd>
          <dt class="text-text-muted">Para cuándo</dt>
          <dd class="font-bold text-text">{{ f.fechaRequerida ? fechaIso(f.fechaRequerida) : 'Sin fecha límite' }}</dd>
          <template v-if="f.paraQuien.trim()">
            <dt class="text-text-muted">Para quién</dt>
            <dd class="font-bold text-text">{{ f.paraQuien.trim() }}</dd>
          </template>
        </dl>
        <ul class="divide-y divide-border rounded-xl border border-border bg-bg">
          <li v-for="(p, i) in f.partidas" :key="p.uid" class="flex items-start gap-2 px-3 py-2">
            <span class="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-vz-blue/15 px-1 text-[11px] font-extrabold text-vz-blue">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="block font-bold text-text">{{ p.cantidad }} × {{ p.producto.trim() }}</span>
              <span class="block text-[12px] text-text-muted">{{ nombreCategoria(p.categoriaId) }}</span>
            </span>
          </li>
        </ul>
        <p class="rounded-xl bg-vz-blue/10 px-3 py-2 text-[12.5px] leading-snug text-text">Al enviar recibirás un correo de confirmación con tu folio y la liga de seguimiento.</p>
        <p v-if="errorEnvio" role="alert" class="rounded-xl border border-vz-danger/40 bg-vz-danger/5 px-3 py-2 text-[13px] font-semibold text-vz-danger">{{ errorEnvio }}</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" :class="btnSecundario" :disabled="enviando" @click="cerrarConfirmacion">Corregir</button>
          <button type="button" :class="btnPrimario" :disabled="enviando" @click="enviar">{{ enviando ? 'Enviando…' : 'Sí, enviar requisición' }}</button>
        </div>
      </div>
    </AppModal>
  </PublicShell>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppModal from 'components/AppModal.vue'
import PublicShell from 'components/compras/publico/PublicShell.vue'
import SkeletonBlock from 'components/compras/publico/SkeletonBlock.vue'
import CampoForm from 'components/compras/publico/CampoForm.vue'
import ComboBox from 'components/compras/publico/ComboBox.vue'
import PasoCard from 'components/compras/publico/PasoCard.vue'
import PartidaCard from 'components/compras/publico/PartidaCard.vue'
import { area, btnPrimario, btnSecundario, copiarTexto, fechaIso, inp, inpError, tarjeta, urlWhatsApp } from 'components/compras/publico/estilos'
import { recordarRequisicion } from 'components/compras/publico/misRequisiciones'
import {
  CLAVE_BORRADOR,
  MAX_PARTIDAS,
  MAX_UBICACIONES,
  armarInput,
  formularioVacio,
  nuevaPartida,
  nuevoProveedor,
  nuevoUid,
  validarFormulario,
} from 'components/compras/publico/formTipos'
import { useToast } from 'src/composables/useToast'
import { todayLocalDateString, toLocalDateString } from 'src/lib/dateUtils'
import {
  RUTAS_COMPRAS,
  avisosAntesDeComprar,
  cargarFormularioPublico,
  comprasModoLocal,
  crearRequisicionPublica,
  urlBase,
} from 'src/lib/compras'

const router = useRouter()
const toast = useToast()

// ---------------------------------------------------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------------------------------------------------
const cargando = ref(true)
const errorCarga = ref('')
const datos = ref(null)
const f = reactive(formularioVacio())
const borradorRecuperado = ref(false)
const hoy = ref(todayLocalDateString())

async function cargar() {
  cargando.value = true
  errorCarga.value = ''
  try {
    if (comprasModoLocal()) {
      // Demo local: para que los avisos vean el stock de inventario hay que tener esas cachés (en Supabase el anónimo no las lee).
      try {
        const [{ loadSistemasCache }, { loadMantenimientoCache }] = await Promise.all([import('src/lib/inventario/sistemas'), import('src/lib/inventario/mantenimiento')])
        await Promise.all([loadSistemasCache(), loadMantenimientoCache()])
      } catch {
        /* los avisos de stock son opcionales */
      }
    }
    datos.value = await cargarFormularioPublico()
    restaurarBorrador()
  } catch (e) {
    errorCarga.value = e instanceof Error && e.message ? 'Revisa tu conexión e intenta de nuevo.' : 'Intenta de nuevo en unos minutos.'
  } finally {
    cargando.value = false
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Listas derivadas
// ---------------------------------------------------------------------------------------------------------------------
const categorias = computed(() => (datos.value?.categorias ?? []).filter((c) => c.activo).sort((a, b) => a.orden - b.orden))
const itemsSolicitantes = computed(() => (datos.value?.directorio ?? []).map((d) => ({ value: d.id, label: d.nombre, sub: d.area })))
const solicitante = computed(() => datos.value?.directorio.find((d) => d.id === f.solicitanteId))
const itemsCatalogo = computed(() => {
  const nombres = new Map(categorias.value.map((c) => [c.id, c.nombre]))
  return (datos.value?.catalogo ?? []).filter((p) => p.activo && nombres.has(p.categoriaId)).map((p) => ({ value: p.id, label: p.producto, sub: nombres.get(p.categoriaId) }))
})
const TITULOS_TIPO = { sucursal: 'Sucursales', cedis: 'CEDIS', oficina: 'Oficinas y áreas' }
const grupos = computed(() => {
  const ub = datos.value?.ubicaciones ?? []
  return ['sucursal', 'cedis', 'oficina']
    .map((tipo) => ({ tipo, titulo: TITULOS_TIPO[tipo], items: ub.filter((u) => u.tipo === tipo) }))
    .filter((g) => g.items.length > 0)
})
const idsSucursales = computed(() => (datos.value?.ubicaciones ?? []).filter((u) => u.tipo === 'sucursal').map((u) => u.id))
const nombreUbic = (id) => datos.value?.ubicaciones.find((u) => u.id === id)?.nombre ?? id
const nombreCategoria = (id) => categorias.value.find((c) => c.id === id)?.nombre ?? ''

const ubicacionesFinales = computed(() => (f.modo === 'general' ? (f.entregaId ? [f.entregaId] : []) : f.ubicaciones))
const lugares = computed(() => ubicacionesFinales.value.map((id) => ({ id, nombre: nombreUbic(id) })))
const hayTI = computed(() => f.partidas.some((p) => categorias.value.find((c) => c.id === p.categoriaId)?.destinoInventario === 'ti'))
const totalPiezas = computed(() => f.partidas.reduce((s, p) => s + (Number(p.cantidad) || 0), 0))

const todasActivo = computed(() => f.modo === 'lista' && idsSucursales.value.length > 0 && idsSucursales.value.every((id) => f.ubicaciones.includes(id)))
const chip = (activo) =>
  `inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vz-blue ${
    activo ? 'border-vz-blue bg-vz-blue text-white' : 'border-border bg-bg text-text hover:bg-surface-hover'
  }`

function alternarUbicacion(id) {
  f.modo = 'lista'
  f.ubicaciones = f.ubicaciones.includes(id) ? f.ubicaciones.filter((x) => x !== id) : [...f.ubicaciones, id]
}
function alternarTodas() {
  f.modo = 'lista'
  f.ubicaciones = todasActivo.value ? f.ubicaciones.filter((id) => !idsSucursales.value.includes(id)) : [...new Set([...f.ubicaciones, ...idsSucursales.value])]
}
function alternarGeneral() {
  if (f.modo === 'general') {
    f.modo = 'lista'
    return
  }
  f.modo = 'general'
  f.ubicaciones = []
  if (!f.entregaId && solicitante.value?.ubicacionId) f.entregaId = solicitante.value.ubicacionId
}
watch(
  () => f.solicitanteId,
  () => {
    if (f.modo === 'general' && !f.entregaId && solicitante.value?.ubicacionId) f.entregaId = solicitante.value.ubicacionId
  },
)

const atajosFecha = computed(() => {
  const d = (n) => {
    const x = new Date()
    x.setDate(x.getDate() + n)
    return toLocalDateString(x)
  }
  return [
    { texto: 'Mañana', valor: d(1) },
    { texto: 'En 3 días', valor: d(3) },
    { texto: 'En 1 semana', valor: d(7) },
  ]
})

// ---------------------------------------------------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------------------------------------------------
function agregarPartida() {
  if (f.partidas.length >= MAX_PARTIDAS) return
  const nueva = nuevaPartida()
  f.partidas.push(nueva)
  void nextTick(() => {
    document.getElementById(`${nueva.uid}-prod`)?.focus()
    document.getElementById(`p-${nueva.uid}`)?.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'center' })
  })
}
function quitarPartida(uid) {
  if (f.partidas.length <= 1) return
  f.partidas = f.partidas.filter((p) => p.uid !== uid)
}

// Avisos antes de comprar (con pequeña espera para no recalcular en cada tecla)
const avisos = ref([])
const descartados = reactive(new Set())
let tAvisos
watch(
  () => f.partidas.map((p) => `${p.producto}|${p.categoriaId}`).join('§'),
  () => {
    clearTimeout(tAvisos)
    tAvisos = setTimeout(() => {
      try {
        avisos.value = avisosAntesDeComprar(f.partidas.map((p) => ({ producto: p.producto.trim().length >= 3 ? p.producto : '', cantidad: p.cantidad, categoriaId: p.categoriaId || undefined })))
      } catch {
        avisos.value = []
      }
    }, 450)
  },
)
const claveAviso = (a) => `${a.tipo}|${a.producto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()}|${a.referencia ?? ''}`
const avisosDe = (n) => avisos.value.filter((a) => a.partida === n && !descartados.has(claveAviso(a)))

// Proveedores
const proveedoresAbiertos = ref(false)
function alternarProveedores() {
  proveedoresAbiertos.value = !proveedoresAbiertos.value
  if (proveedoresAbiertos.value && f.proveedores.length === 0) f.proveedores.push(nuevoProveedor())
}

// "No estoy en la lista"
const faltaEnLista = ref(false)
const alta = reactive({ nombre: '', area: '', correo: '' })
const altaCopiada = ref(false)
const altaLista = computed(() => alta.nombre.trim().length > 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alta.correo.trim()))
const mensajeAlta = computed(
  () =>
    `Hola, necesito levantar una requisición en Compras Indirectas pero no aparezco en el directorio de solicitantes. ¿Me pueden dar de alta? Mis datos: ${alta.nombre.trim()}${alta.area.trim() ? `, área ${alta.area.trim()}` : ''}, correo ${alta.correo.trim()}.`,
)
async function copiarAlta() {
  if (await copiarTexto(mensajeAlta.value)) {
    altaCopiada.value = true
    setTimeout(() => (altaCopiada.value = false), 2000)
  } else toast('No pudimos copiar. Selecciona el texto manualmente.', 'error')
}

// ---------------------------------------------------------------------------------------------------------------------
// Validación y envío
// ---------------------------------------------------------------------------------------------------------------------
const intento = ref(false)
const errores = computed(() => validarFormulario(f, { categorias: categorias.value, ubicacionesFinales: ubicacionesFinales.value, hoy: hoy.value }))
const ver = (m) => (intento.value ? m : undefined)
const bloqueErrores = ref(null)

const movimientoReducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function saltarA(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'center' })
  const foco = el.matches('input,select,textarea,button') ? el : el.querySelector('input:not([type=hidden]):not([readonly]),select,textarea')
  window.setTimeout(() => foco?.focus({ preventScroll: true }), movimientoReducido() ? 0 : 300)
}

const confirmando = ref(false)
const enviando = ref(false)
const errorEnvio = ref('')

function revisar() {
  intento.value = true
  if (errores.value.lista.length) {
    toast(`Falta completar ${errores.value.lista.length} ${errores.value.lista.length === 1 ? 'dato' : 'datos'}.`, 'error')
    void nextTick(() => saltarA(errores.value.lista[0].id))
    return
  }
  errorEnvio.value = ''
  confirmando.value = true
}
function cerrarConfirmacion() {
  if (!enviando.value) confirmando.value = false
}

const resultado = ref(null)
const tituloExito = ref(null)

async function enviar() {
  if (enviando.value) return
  enviando.value = true
  errorEnvio.value = ''
  try {
    const input = armarInput(f, ubicacionesFinales.value, f.modo === 'general' ? nombreUbic(f.entregaId) : undefined)
    const r = await crearRequisicionPublica(input)
    resultado.value = r
    recordarRequisicion({ folio: r.folio, token: r.token, fecha: Date.now(), solicitante: solicitante.value?.nombre })
    borrarBorrador()
    confirmando.value = false
    void nextTick(() => {
      window.scrollTo({ top: 0 })
      tituloExito.value?.focus({ preventScroll: true })
    })
  } catch (e) {
    errorEnvio.value = e instanceof Error && e.message ? e.message : 'No pudimos enviar la requisición. Intenta de nuevo.'
  } finally {
    enviando.value = false
  }
}

// Éxito
const ligaSeguimiento = computed(() => (resultado.value ? `${urlBase()}${RUTAS_COMPRAS.estatus(resultado.value.folio, resultado.value.token)}` : ''))
const textoWhatsApp = computed(() => (resultado.value ? `Levanté la requisición ${resultado.value.folio} en Compras Indirectas de Grupo Vizcarra. Aquí puedes ver cómo va: ${ligaSeguimiento.value}` : ''))
const copiado = ref(false)
async function copiarLiga() {
  if (await copiarTexto(ligaSeguimiento.value)) {
    copiado.value = true
    setTimeout(() => (copiado.value = false), 2200)
  } else toast('No pudimos copiar. Mantén presionada la liga para copiarla.', 'error')
}
function verSeguimiento() {
  if (resultado.value) void router.push(RUTAS_COMPRAS.estatus(resultado.value.folio, resultado.value.token))
}
function otraRequisicion() {
  const sol = f.solicitanteId
  Object.assign(f, formularioVacio(), { solicitanteId: sol })
  descartados.clear()
  avisos.value = []
  intento.value = false
  resultado.value = null
  proveedoresAbiertos.value = false
  window.scrollTo({ top: 0 })
}

// ---------------------------------------------------------------------------------------------------------------------
// Borrador (localStorage hasta enviar)
// ---------------------------------------------------------------------------------------------------------------------
let tGuardar
let restaurando = false

function escribirBorrador(sinImagenes) {
  const copia = JSON.parse(JSON.stringify(f))
  if (sinImagenes) copia.partidas.forEach((p) => (p.imagenUrl = ''))
  localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ v: 1, guardado: Date.now(), ...copia }))
}
function guardarBorrador() {
  if (restaurando || resultado.value || !datos.value) return
  try {
    const vacio = !f.solicitanteId && f.ubicaciones.length === 0 && f.partidas.every((p) => !p.producto.trim() && !p.descripcion.trim())
    if (vacio) {
      localStorage.removeItem(CLAVE_BORRADOR)
      return
    }
    try {
      escribirBorrador(false)
    } catch {
      escribirBorrador(true) // cuota llena: se guarda sin fotos
    }
  } catch {
    /* sin almacenamiento: el formulario funciona igual */
  }
}
function borrarBorrador() {
  clearTimeout(tGuardar)
  try {
    localStorage.removeItem(CLAVE_BORRADOR)
  } catch {
    /* nada */
  }
}
watch(
  f,
  () => {
    clearTimeout(tGuardar)
    tGuardar = setTimeout(guardarBorrador, 700)
  },
  { deep: true },
)

function restaurarBorrador() {
  const d = datos.value
  if (!d) return
  try {
    const raw = localStorage.getItem(CLAVE_BORRADOR)
    if (!raw) return
    const b = JSON.parse(raw)
    if (!b || !Array.isArray(b.partidas)) return
    const ub = new Set(d.ubicaciones.map((u) => u.id))
    const cats = new Set(d.categorias.filter((c) => c.activo).map((c) => c.id))
    const partidas = b.partidas.slice(0, MAX_PARTIDAS).map((p) => ({
      ...nuevaPartida(),
      ...p,
      uid: nuevoUid(),
      categoriaId: cats.has(p.categoriaId) ? p.categoriaId : '',
      cantidad: Math.min(100000, Math.max(1, Math.round(Number(p.cantidad)) || 1)),
      distribucion: p.distribucion && typeof p.distribucion === 'object' ? p.distribucion : {},
    }))
    if (!partidas.some((p) => p.producto.trim()) && !b.solicitanteId) return
    restaurando = true
    Object.assign(f, formularioVacio(), {
      solicitanteId: d.directorio.some((x) => x.id === b.solicitanteId) ? b.solicitanteId : '',
      modo: b.modo === 'general' ? 'general' : 'lista',
      ubicaciones: (b.ubicaciones ?? []).filter((id) => ub.has(id)),
      entregaId: b.entregaId && ub.has(b.entregaId) ? b.entregaId : '',
      urgencia: b.urgencia === 'urgente' ? 'urgente' : 'normal',
      motivoUrgencia: b.motivoUrgencia ?? '',
      fechaRequerida: b.fechaRequerida && b.fechaRequerida >= hoy.value ? b.fechaRequerida : '',
      paraQuien: b.paraQuien ?? '',
      notas: b.notas ?? '',
      partidas: partidas.length ? partidas : [nuevaPartida()],
      proveedores: (b.proveedores ?? []).slice(0, 3).map((p) => ({ ...nuevoProveedor(), ...p })),
    })
    proveedoresAbiertos.value = f.proveedores.length > 0
    borradorRecuperado.value = true
    void nextTick(() => {
      restaurando = false
    })
  } catch {
    restaurando = false
  }
}
function empezarDeNuevo() {
  borrarBorrador()
  Object.assign(f, formularioVacio())
  descartados.clear()
  avisos.value = []
  intento.value = false
  proveedoresAbiertos.value = false
  borradorRecuperado.value = false
}

onMounted(cargar)
onBeforeUnmount(() => {
  clearTimeout(tGuardar)
  clearTimeout(tAvisos)
})
</script>
