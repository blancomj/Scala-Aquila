import type { ArticuloAyuda } from '~/types/ayuda'

// Centro de ayuda (piloto) — contenido redactado para el usuario final a partir de lo
// que cada módulo hace hoy en la app real (no es un volcado de los docs técnicos
// internos). Al ampliar esta lista, verificar cada afirmación contra la pantalla
// correspondiente antes de escribirla.

export const ARTICULOS_AYUDA: ArticuloAyuda[] = [
  {
    slug: 'cartera-cobranza',
    modulo: 'Cartera',
    titulo: 'Cartera y cobranza: cómo funciona',
    resumen:
      'Qué es la cartera vencida, cómo se clasifica, y el camino que sigue un inmueble desde el primer día de mora hasta un acuerdo de pago o un caso jurídico.',
    tags: ['cartera', 'cobranza', 'mora', 'escalamiento', 'acuerdos de pago', 'promesas de pago', 'jurídico'],
    bloques: [
      {
        tipo: 'texto',
        parrafos: [
          'La cartera es la deuda vencida de los inmuebles de la copropiedad. Cada inmueble tiene, en todo momento, una clasificación según cuántos días de mora acumula y una etapa de cobranza según qué tan avanzado está el proceso.',
          'Ambas cosas se calculan solas todos los días a partir de los pagos y cargos reales — nadie las edita a mano.',
        ],
      },
      {
        tipo: 'pasos',
        items: [
          'Al día: sin saldo vencido.',
          'Mora temprana (1-30 días) e inicial (31-60 días): primeros recordatorios.',
          'Mora media (61-90 días) y avanzada (91-120 días): gestión más activa.',
          'Mora crítica (121-180 días): al borde de pasar a gestión prejurídica.',
          'Alto riesgo (181-360 días) y crítica (más de 360 días): en gestión jurídica.',
        ],
      },
      {
        tipo: 'texto',
        parrafos: [
          'La etapa de cobranza sigue ese mismo camino en cinco pasos: preventiva → administrativa → prejurídica → jurídica → judicial. Si el inmueble paga y su saldo vencido baja o llega a cero, la etapa retrocede sola — el escalamiento no es de una sola vía.',
          'Pasar de una etapa a otra casi nunca es automático: cuando el sistema detecta que un inmueble ya cumple las condiciones para avanzar (o retroceder desde jurídica/judicial), lo deja propuesto en "Centro de escalamiento" para que un administrador lo confirme. Quien propone el cambio no puede ser quien lo confirma.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'Un acuerdo de pago vigente congela la etapa del inmueble mientras dure, sin importar los días de mora que acumule.',
      },
      {
        tipo: 'texto',
        parrafos: [
          'La "Bandeja de acciones de cobranza" es la cola de trabajo diaria: ahí se aprueban y despachan los recordatorios, avisos y requerimientos que corresponden a cada inmueble según su etapa. Tres estados no se deben confundir: aprobada (alguien autorizó que salga, pero todavía no salió), ejecutada (ya se despachó al proveedor de envío) y acreditada (ya hay una constancia — acuse, entrega confirmada — que sirve como prueba). Solo lo acreditado cuenta para poder escalar a gestión prejurídica o jurídica.',
        ],
      },
      {
        tipo: 'texto',
        parrafos: [
          '"Promesas y acuerdos de pago" distingue dos figuras: la promesa es un compromiso informal (no cambia la etapa del inmueble); el acuerdo de pago es formal, con calendario de cuotas, y sí se puede usar para congelar la etapa mientras el deudor cumple.',
          '"Casos jurídicos" registra las demandas y su seguimiento; "Certificaciones de deuda" emite el soporte formal del saldo que se necesita antes de poder demandar; "Actos interruptivos de prescripción" y "Transferencias de propiedad" son bitácoras factuales — dejan constancia de lo que pasó, pero no calculan plazos ni reasignan deuda por sí solas.',
        ],
      },
      {
        tipo: 'preguntas',
        items: [
          {
            pregunta: '¿Por qué no veo movimiento en cartera aunque haya inmuebles morosos?',
            respuesta:
              'Revisa "Configuración de cartera": sin una política de clasificación vigente (tramos de mora y estrategias de cobranza activas), el proceso diario no clasifica ni propone acciones para ningún inmueble.',
          },
          {
            pregunta: '¿Puedo aprobar y ejecutar yo mismo la misma acción de cobranza?',
            respuesta:
              'No. Quien aprueba una acción o confirma un escalamiento no puede ser la misma persona que la propuso — siempre se necesita un segundo administrador.',
          },
          {
            pregunta: 'Los indicadores de cobranza (Roll Rate, Cure Rate) no muestran datos, ¿por qué?',
            respuesta:
              'Esos dos indicadores comparan dos fechas de corte congeladas (snapshots). Si no existe snapshot para alguna de las dos fechas, la pantalla lo avisa en vez de mostrar un porcentaje inventado.',
          },
        ],
      },
    ],
  },
  {
    slug: 'mantenimiento-activos-ordenes',
    modulo: 'Mantenimiento',
    titulo: 'Mantenimiento: activos, planes e incidencias',
    resumen:
      'Cómo se relacionan el inventario de activos, los planes de mantenimiento, las incidencias y las órdenes de trabajo, y qué hace el semáforo de cumplimiento normativo.',
    tags: ['mantenimiento', 'activos', 'incidencias', 'órdenes de trabajo', 'proveedores', 'contratos', 'cumplimiento'],
    bloques: [
      {
        tipo: 'texto',
        parrafos: [
          'El módulo de Mantenimiento gira alrededor de los "Activos": el inventario de equipos e instalaciones de la copropiedad (ascensores, bombas, planta eléctrica, etc.), cada uno con su ficha técnica y un nivel de criticidad.',
          'Sobre ese inventario se apoyan tres cosas: los planes de mantenimiento preventivo, las incidencias que se reportan cuando algo falla, y las órdenes de trabajo que documentan lo que efectivamente se hizo.',
        ],
      },
      {
        tipo: 'pasos',
        items: [
          'Activos: se registran con su tipo, atributos técnicos y criticidad (los tipos y sus atributos se configuran una sola vez en "Configuración de mantenimiento").',
          'Planes de mantenimiento: definen cada cuánto se le debe hacer mantenimiento a un tipo de activo, y generan un calendario de próximas programaciones para toda la copropiedad.',
          'Incidencias: se reportan cuando algo falla (el reportante puede ser cualquier persona, incluso sin usuario en el sistema — quien la registra es siempre un usuario con sesión).',
          'Órdenes de trabajo: nacen de una programación del plan, de una incidencia que se convierte en OT, o se crean manualmente para un trabajo puntual.',
        ],
      },
      {
        tipo: 'texto',
        parrafos: [
          '"Cumplimiento normativo" muestra un semáforo por cada requisito legal o técnico aplicable (y, cuando el requisito aplica a un tipo de activo, un semáforo por cada activo de ese tipo). El semáforo siempre se calcula a partir de la evidencia registrada — nunca es un valor que alguien marque a mano. Registrar cumplimiento es agregar un registro nuevo con su evidencia; los anteriores no se editan ni se borran.',
          '"Proveedores y contratistas" no es una lista aparte: son los mismos terceros de la copropiedad que tienen asignado el rol de proveedor o contratista, y la ficha muestra primero el semáforo de habilitación (documentación al día) antes que su calificación. "Contratos" liga esos proveedores a contratos de mantenimiento preventivo, obra civil, vigilancia o aseo, y siempre muestra el estado real del contrato (vigente, por vencer o vencido) calculado a la fecha de hoy, no el que quedó guardado cuando se creó.',
        ],
      },
      {
        tipo: 'preguntas',
        items: [
          {
            pregunta: '¿Tengo que crear una orden de trabajo manualmente para cada incidencia?',
            respuesta:
              'No necesariamente. Una incidencia se puede convertir directamente en orden de trabajo desde su propia pantalla; "Nueva OT" manual es solo para trabajos que no partieron de una incidencia ni de una programación del plan.',
          },
          {
            pregunta: '¿Por qué no puedo editar un registro de cumplimiento anterior?',
            respuesta:
              'El historial de cumplimiento es append-only a propósito: sirve como evidencia de que el requisito se verificó en una fecha concreta. Si la situación cambió, se registra una evidencia nueva, no se corrige la anterior.',
          },
        ],
      },
    ],
  },
  {
    slug: 'presupuesto-y-fondos',
    modulo: 'Presupuesto y Fondos',
    titulo: 'Presupuesto y Fondos: cómo se arma y se controla',
    resumen:
      'La estructura de Presupuesto (plan de cuentas, fuentes de financiación, ejecución) y cómo se administran los Fondos con destinación específica.',
    tags: ['presupuesto', 'fondos', 'periodos', 'ejecución presupuestal', 'coeficientes', 'fuentes de financiación'],
    bloques: [
      {
        tipo: 'texto',
        parrafos: [
          'Presupuesto se organiza en pestañas dentro de una misma pantalla: "Presupuestos" (los presupuestos creados y cuál está vigente), "Plan de cuentas" (los rubros de ingreso y egreso), "Fuentes de financiación", "Ejecución presupuestal" (lo presupuestado frente a lo real), "Coeficientes" (cómo se distribuye entre inmuebles) y "Simulación de cobro".',
          '"Periodos y vigencia", "Control y validaciones" y "Fundamentos normativos" son pantallas propias en el menú lateral — antes eran pestañas de la misma página, pero se independizaron.',
        ],
      },
      {
        tipo: 'texto',
        parrafos: [
          'Fondos administra el dinero con destinación específica (por ejemplo, un fondo de imprevistos), separado del presupuesto ordinario. Tiene sus propias pestañas: "Fondos" (el listado y su saldo), "Movimientos" (entradas y salidas), "Compromisos" (dinero apartado para un uso ya decidido pero aún no ejecutado) y "Solicitudes de uso" (pedir usar el fondo, sujeto a aprobación).',
        ],
      },
      {
        tipo: 'pasos',
        items: [
          'Propuesto: el fondo se creó pero todavía no está operativo.',
          'Pendiente de autorización: a la espera de que se apruebe.',
          'Activo: se puede usar (registrar movimientos y solicitudes).',
          'Suspendido: temporalmente fuera de uso.',
          'Agotado: sin saldo disponible.',
          'En cierre → Cerrado: se está liquidando o ya se liquidó.',
          'Cancelado: no llegó a activarse.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'Un fondo solo admite movimientos y solicitudes de uso mientras está en estado "Activo". Cada cambio de estado lo valida el sistema — la pantalla no ofrece un botón que la base de datos vaya a rechazar.',
      },
      {
        tipo: 'preguntas',
        items: [
          {
            pregunta: '¿"Ejecución presupuestal" muestra $0 en rubros de egreso aunque haya movimientos?',
            respuesta:
              'Verifica que el "Plan de cuentas" esté cargado para el presupuesto vigente — el cálculo de ejecución por rubro depende de que cada rubro tenga su cuenta asociada.',
          },
          {
            pregunta: '¿En qué se diferencia un "Compromiso" de un "Movimiento" en Fondos?',
            respuesta:
              'El compromiso aparta saldo del fondo para un uso ya decidido pero que todavía no se ha pagado; el movimiento es la entrada o salida de dinero que ya ocurrió.',
          },
        ],
      },
    ],
  },
]
