/**
 * Prepara un examen para enviarlo a la base de investigación.
 *
 * Se eliminan los datos que pueden identificar al paciente (ID o iniciales,
 * observaciones de texto libre) y el registro detallado de cada estímulo,
 * que es pesado y no hace falta para la base normativa. Se conservan edad,
 * ojo, diagnóstico, resultados, confiabilidad y datos del equipo.
 */
export const IDENTIFYING_FIELDS = ['patientId', 'notes'];
export const DIAGNOSES = {
  '': 'Sin especificar',
  normal: 'Sujeto normal',
  'sospecha-glaucoma': 'Sospecha de glaucoma',
  glaucoma: 'Glaucoma',
  retina: 'Retina / mácula',
  neuro: 'Neuro-oftalmología',
  otro: 'Otro',
};

export function anonymize(result, { site = '' } = {}) {
  const copy = JSON.parse(JSON.stringify(result));
  for (const f of IDENTIFYING_FIELDS) delete copy.meta?.[f];
  delete copy.log;
  delete copy.meta?.uploadedAt;
  copy.meta = { ...copy.meta, site };
  return copy;
}

/** Puede enviarse solo si el paciente dio consentimiento y no es una simulación. */
export const isShareable = (result) => Boolean(result?.meta?.consent) && result.meta.mode !== 'simulation';
