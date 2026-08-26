/**
 * GENERADO — no editar a mano (Fase I §3.3, DB-first).
 * Regenerar con: pnpm db:types
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      acciones_cobranza: {
        Row: {
          alcance: Database["public"]["Enums"]["alcance_accion_cobranza_t"]
          aprobada_at: string | null
          aprobada_por: string | null
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          cargo_id: string | null
          clasificacion_codigo: string
          contenido_hash: string | null
          creada_por: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          created_at: string
          destinatario_contacto: string | null
          destinatario_rol_codigo: string
          destinatario_tercero_id: string
          deuda_total_al_momento: number
          dias_mora_al_momento: number
          ejecutada_por: string | null
          estado: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          estrategia_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          id: string
          inmueble_id: string
          intento_numero: number
          notas: string | null
          plantilla_codigo: string | null
          politica_clasificacion_id: string
          politica_version: number
          propuesta_por: string | null
          referencia_externa: string | null
          resultado:
            | Database["public"]["Enums"]["resultado_accion_cobranza_t"]
            | null
          resultado_fecha: string | null
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
        }
        Insert: {
          alcance?: Database["public"]["Enums"]["alcance_accion_cobranza_t"]
          aprobada_at?: string | null
          aprobada_por?: string | null
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          cargo_id?: string | null
          clasificacion_codigo: string
          contenido_hash?: string | null
          creada_por: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          created_at?: string
          destinatario_contacto?: string | null
          destinatario_rol_codigo: string
          destinatario_tercero_id: string
          deuda_total_al_momento: number
          dias_mora_al_momento: number
          ejecutada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          estrategia_id?: string | null
          fecha_ejecucion?: string | null
          fecha_programada: string
          id?: string
          inmueble_id: string
          intento_numero?: number
          notas?: string | null
          plantilla_codigo?: string | null
          politica_clasificacion_id: string
          politica_version: number
          propuesta_por?: string | null
          referencia_externa?: string | null
          resultado?:
            | Database["public"]["Enums"]["resultado_accion_cobranza_t"]
            | null
          resultado_fecha?: string | null
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
        }
        Update: {
          alcance?: Database["public"]["Enums"]["alcance_accion_cobranza_t"]
          aprobada_at?: string | null
          aprobada_por?: string | null
          canal?: Database["public"]["Enums"]["canal_cobranza_t"]
          cargo_id?: string | null
          clasificacion_codigo?: string
          contenido_hash?: string | null
          creada_por?: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          created_at?: string
          destinatario_contacto?: string | null
          destinatario_rol_codigo?: string
          destinatario_tercero_id?: string
          deuda_total_al_momento?: number
          dias_mora_al_momento?: number
          ejecutada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          estrategia_id?: string | null
          fecha_ejecucion?: string | null
          fecha_programada?: string
          id?: string
          inmueble_id?: string
          intento_numero?: number
          notas?: string | null
          plantilla_codigo?: string | null
          politica_clasificacion_id?: string
          politica_version?: number
          propuesta_por?: string | null
          referencia_externa?: string | null
          resultado?:
            | Database["public"]["Enums"]["resultado_accion_cobranza_t"]
            | null
          resultado_fecha?: string | null
          tenant_id?: string
          tipo_accion?: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
        }
        Relationships: [
          {
            foreignKeyName: "acciones_cobranza_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_destinatario_tercero_id_fkey"
            columns: ["destinatario_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_ejecutada_por_fkey"
            columns: ["ejecutada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_estrategia_id_fkey"
            columns: ["estrategia_id"]
            isOneToOne: false
            referencedRelation: "estrategias_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_politica_clasificacion_id_fkey"
            columns: ["politica_clasificacion_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_propuesta_por_fkey"
            columns: ["propuesta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acuerdo_pago_cuotas: {
        Row: {
          acuerdo_id: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_cuota_acuerdo_t"]
          fecha_pago: string | null
          fecha_vencimiento: string
          id: string
          monto: number
          monto_pagado: number
          numero_cuota: number
          tenant_id: string
        }
        Insert: {
          acuerdo_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cuota_acuerdo_t"]
          fecha_pago?: string | null
          fecha_vencimiento: string
          id?: string
          monto: number
          monto_pagado?: number
          numero_cuota: number
          tenant_id: string
        }
        Update: {
          acuerdo_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cuota_acuerdo_t"]
          fecha_pago?: string | null
          fecha_vencimiento?: string
          id?: string
          monto?: number
          monto_pagado?: number
          numero_cuota?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acuerdo_pago_cuotas_acuerdo_id_fkey"
            columns: ["acuerdo_id"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdo_pago_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdo_pago_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acuerdos_pago: {
        Row: {
          acta_referencia: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          condona_interes: boolean
          consecutivo: string
          created_at: string
          cuota_inicial: number
          documento_url: string | null
          estado: Database["public"]["Enums"]["estado_acuerdo_t"]
          etapa_congelada:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          fecha_acuerdo: string
          fecha_fin: string
          fecha_incumplimiento: string | null
          fecha_inicio: string
          id: string
          inmueble_id: string
          interes_durante_acuerdo: boolean
          monto_capital: number
          monto_condonado: number
          monto_interes: number
          monto_otros: number
          monto_total: number
          motivo_incumplimiento: string | null
          numero_cuotas: number
          propuesto_por: string | null
          tenant_id: string
        }
        Insert: {
          acta_referencia?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          condona_interes?: boolean
          consecutivo: string
          created_at?: string
          cuota_inicial?: number
          documento_url?: string | null
          estado?: Database["public"]["Enums"]["estado_acuerdo_t"]
          etapa_congelada?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          fecha_acuerdo: string
          fecha_fin: string
          fecha_incumplimiento?: string | null
          fecha_inicio: string
          id?: string
          inmueble_id: string
          interes_durante_acuerdo?: boolean
          monto_capital?: number
          monto_condonado?: number
          monto_interes?: number
          monto_otros?: number
          monto_total: number
          motivo_incumplimiento?: string | null
          numero_cuotas: number
          propuesto_por?: string | null
          tenant_id: string
        }
        Update: {
          acta_referencia?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          condona_interes?: boolean
          consecutivo?: string
          created_at?: string
          cuota_inicial?: number
          documento_url?: string | null
          estado?: Database["public"]["Enums"]["estado_acuerdo_t"]
          etapa_congelada?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          fecha_acuerdo?: string
          fecha_fin?: string
          fecha_incumplimiento?: string | null
          fecha_inicio?: string
          id?: string
          inmueble_id?: string
          interes_durante_acuerdo?: boolean
          monto_capital?: number
          monto_condonado?: number
          monto_interes?: number
          monto_otros?: number
          monto_total?: number
          motivo_incumplimiento?: string | null
          numero_cuotas?: number
          propuesto_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acuerdos_pago_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_propuesto_por_fkey"
            columns: ["propuesto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agrupaciones: {
        Row: {
          activa: boolean
          busqueda_tsv: unknown
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          parent_id: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          busqueda_tsv?: unknown
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          parent_id?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          busqueda_tsv?: unknown
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          parent_id?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agrupaciones_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: unknown
          metadata: Json
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: unknown
          metadata?: Json
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: unknown
          metadata?: Json
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          cargo_capital_origen_id: string | null
          cargo_reversado_id: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id: string | null
          created_at: string
          fecha_vencimiento: string | null
          id: string
          inmueble_id: string
          liquidacion_linea_id: string | null
          monto_original: number
          novedad_id: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id: string
          tenant_id: string
        }
        Insert: {
          cargo_capital_origen_id?: string | null
          cargo_reversado_id?: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id?: string | null
          created_at?: string
          fecha_vencimiento?: string | null
          id?: string
          inmueble_id: string
          liquidacion_linea_id?: string | null
          monto_original: number
          novedad_id?: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id: string
          tenant_id: string
        }
        Update: {
          cargo_capital_origen_id?: string | null
          cargo_reversado_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id?: string | null
          created_at?: string
          fecha_vencimiento?: string | null
          id?: string
          inmueble_id?: string
          liquidacion_linea_id?: string | null
          monto_original?: number
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_reversado_id_fkey"
            columns: ["cargo_reversado_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_reversado_id_fkey"
            columns: ["cargo_reversado_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_liquidacion_linea_id_fkey"
            columns: ["liquidacion_linea_id"]
            isOneToOne: false
            referencedRelation: "liquidacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cartera_etapas: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_anterior: Database["public"]["Enums"]["etapa_cobranza_t"] | null
          etapa_propuesta:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          id: string
          inmueble_id: string
          motivo_propuesta: string | null
          propuesto_at: string | null
          propuesto_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_anterior?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          etapa_propuesta?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          id?: string
          inmueble_id: string
          motivo_propuesta?: string | null
          propuesto_at?: string | null
          propuesto_por?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_anterior?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          etapa_propuesta?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          id?: string
          inmueble_id?: string
          motivo_propuesta?: string | null
          propuesto_at?: string | null
          propuesto_por?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cartera_etapas_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_propuesto_por_fkey"
            columns: ["propuesto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      caso_juridico_actuaciones: {
        Row: {
          caso_id: string
          created_at: string
          descripcion: string
          estado_desde:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          estado_hasta:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          fecha: string
          id: string
          registrada_por: string | null
          tenant_id: string
          tipo_actuacion_id: number
        }
        Insert: {
          caso_id: string
          created_at?: string
          descripcion: string
          estado_desde?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          estado_hasta?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          fecha: string
          id?: string
          registrada_por?: string | null
          tenant_id: string
          tipo_actuacion_id: number
        }
        Update: {
          caso_id?: string
          created_at?: string
          descripcion?: string
          estado_desde?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          estado_hasta?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          fecha?: string
          id?: string
          registrada_por?: string | null
          tenant_id?: string
          tipo_actuacion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "caso_juridico_actuaciones_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_tipo_actuacion_id_fkey"
            columns: ["tipo_actuacion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      casos_juridicos: {
        Row: {
          abogado_tercero_id: string | null
          aprobado_at: string
          aprobado_por: string | null
          busqueda_tsv: unknown
          certificacion_id: string
          ciudad: string | null
          consecutivo: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_caso_juridico_t"]
          fecha_apertura: string | null
          fecha_cierre: string | null
          fecha_pretension: string
          fecha_proxima_actuacion: string | null
          fecha_remision: string
          fecha_ultima_actuacion: string | null
          id: string
          inmueble_id: string
          juzgado: string | null
          monto_pretension: number
          monto_recuperado: number
          motivo_cierre: string | null
          numero_radicado: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          abogado_tercero_id?: string | null
          aprobado_at?: string
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          certificacion_id: string
          ciudad?: string | null
          consecutivo: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_caso_juridico_t"]
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_pretension: string
          fecha_proxima_actuacion?: string | null
          fecha_remision: string
          fecha_ultima_actuacion?: string | null
          id?: string
          inmueble_id: string
          juzgado?: string | null
          monto_pretension: number
          monto_recuperado?: number
          motivo_cierre?: string | null
          numero_radicado?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          abogado_tercero_id?: string | null
          aprobado_at?: string
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          certificacion_id?: string
          ciudad?: string | null
          consecutivo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_caso_juridico_t"]
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_pretension?: string
          fecha_proxima_actuacion?: string | null
          fecha_remision?: string
          fecha_ultima_actuacion?: string | null
          id?: string
          inmueble_id?: string
          juzgado?: string | null
          monto_pretension?: number
          monto_recuperado?: number
          motivo_cierre?: string | null
          numero_radicado?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casos_juridicos_abogado_tercero_id_fkey"
            columns: ["abogado_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_certificacion_id_fkey"
            columns: ["certificacion_id"]
            isOneToOne: false
            referencedRelation: "certificaciones_deuda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      certificaciones_deuda: {
        Row: {
          anulada_at: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          cargo_firmante: string
          certificacion_hash: string
          consecutivo: string
          created_at: string
          detalle_cargos: Json
          documento_url: string | null
          estado: Database["public"]["Enums"]["estado_certificacion_t"]
          expedida_por: string | null
          fecha_corte: string
          fecha_expedicion: string
          id: string
          inmueble_id: string
          monto_expensas_extraordinarias: number
          monto_expensas_ordinarias: number
          monto_intereses_mora: number
          monto_otros: number
          monto_sanciones: number
          monto_total: number
          politica_financiera_id: string
          politica_version: number
          tenant_id: string
        }
        Insert: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          cargo_firmante: string
          certificacion_hash: string
          consecutivo: string
          created_at?: string
          detalle_cargos: Json
          documento_url?: string | null
          estado?: Database["public"]["Enums"]["estado_certificacion_t"]
          expedida_por?: string | null
          fecha_corte: string
          fecha_expedicion: string
          id?: string
          inmueble_id: string
          monto_expensas_extraordinarias?: number
          monto_expensas_ordinarias?: number
          monto_intereses_mora?: number
          monto_otros?: number
          monto_sanciones?: number
          monto_total: number
          politica_financiera_id: string
          politica_version: number
          tenant_id: string
        }
        Update: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          cargo_firmante?: string
          certificacion_hash?: string
          consecutivo?: string
          created_at?: string
          detalle_cargos?: Json
          documento_url?: string | null
          estado?: Database["public"]["Enums"]["estado_certificacion_t"]
          expedida_por?: string | null
          fecha_corte?: string
          fecha_expedicion?: string
          id?: string
          inmueble_id?: string
          monto_expensas_extraordinarias?: number
          monto_expensas_ordinarias?: number
          monto_intereses_mora?: number
          monto_otros?: number
          monto_sanciones?: number
          monto_total?: number
          politica_financiera_id?: string
          politica_version?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificaciones_deuda_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_expedida_por_fkey"
            columns: ["expedida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_politica_financiera_id_fkey"
            columns: ["politica_financiera_id"]
            isOneToOne: false
            referencedRelation: "politicas_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coeficiente_sets: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          suma_total: number
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          suma_total: number
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          suma_total?: number
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coeficiente_sets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficiente_sets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coeficientes: {
        Row: {
          created_at: string
          id: string
          inmueble_id: string
          set_id: string
          tenant_id: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          inmueble_id: string
          set_id: string
          tenant_id: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          id?: string
          inmueble_id?: string
          set_id?: string
          tenant_id?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "coeficientes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "coeficiente_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      concepto_test_cases: {
        Row: {
          concepto_id: string
          created_at: string
          created_by: string
          entradas: Json
          id: string
          nombre: string
          resultado_esperado: Json | null
          tenant_id: string
          tipo_esperado: string
        }
        Insert: {
          concepto_id: string
          created_at?: string
          created_by: string
          entradas?: Json
          id?: string
          nombre: string
          resultado_esperado?: Json | null
          tenant_id: string
          tipo_esperado: string
        }
        Update: {
          concepto_id?: string
          created_at?: string
          created_by?: string
          entradas?: Json
          id?: string
          nombre?: string
          resultado_esperado?: Json | null
          tenant_id?: string
          tipo_esperado?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepto_test_cases_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_test_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_test_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_test_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      concepto_versiones: {
        Row: {
          alcance: Database["public"]["Enums"]["concepto_alcance_t"] | null
          alcance_condiciones: Json | null
          concepto_id: string
          created_at: string
          created_by: string
          estado_concepto: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio: number | null
          fecha_fin_mes: number | null
          fecha_inicio_anio: number | null
          fecha_inicio_mes: number | null
          formula_ael: string | null
          hash: string
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          prioridad: number
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo: number | null
          version: number
        }
        Insert: {
          alcance?: Database["public"]["Enums"]["concepto_alcance_t"] | null
          alcance_condiciones?: Json | null
          concepto_id: string
          created_at?: string
          created_by: string
          estado_concepto: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          hash: string
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          prioridad: number
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo?: number | null
          version?: number
        }
        Update: {
          alcance?: Database["public"]["Enums"]["concepto_alcance_t"] | null
          alcance_condiciones?: Json | null
          concepto_id?: string
          created_at?: string
          created_by?: string
          estado_concepto?: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          hash?: string
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor?: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre?: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          prioridad?: number
          tenant_id?: string
          tipo_recurrencia?: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "concepto_versiones_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_versiones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos: {
        Row: {
          alcance: Database["public"]["Enums"]["concepto_alcance_t"]
          alcance_condiciones: Json | null
          aprobado_at: string | null
          aprobado_por: string | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          enviado_a_revision_at: string | null
          enviado_a_revision_por: string | null
          estado: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio: number | null
          fecha_fin_mes: number | null
          fecha_inicio_anio: number | null
          fecha_inicio_mes: number | null
          formula_ael: string | null
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_id: string | null
          prioridad: number
          rechazado_motivo: string | null
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          updated_at: string | null
          valor_fijo: number | null
          version: number
        }
        Insert: {
          alcance: Database["public"]["Enums"]["concepto_alcance_t"]
          alcance_condiciones?: Json | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          enviado_a_revision_at?: string | null
          enviado_a_revision_por?: string | null
          estado?: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_id?: string | null
          prioridad?: number
          rechazado_motivo?: string | null
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          updated_at?: string | null
          valor_fijo?: number | null
          version?: number
        }
        Update: {
          alcance?: Database["public"]["Enums"]["concepto_alcance_t"]
          alcance_condiciones?: Json | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          enviado_a_revision_at?: string | null
          enviado_a_revision_por?: string | null
          estado?: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor?: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre?: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_id?: string | null
          prioridad?: number
          rechazado_motivo?: string | null
          tenant_id?: string
          tipo_recurrencia?: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          updated_at?: string | null
          valor_fijo?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "conceptos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_enviado_a_revision_por_fkey"
            columns: ["enviado_a_revision_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_codigo_retirado: {
        Row: {
          codigo: string
          created_at: string
          fundamento_normativo_id: number | null
          motivo: string
          plan_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          fundamento_normativo_id?: number | null
          motivo: string
          plan_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          fundamento_normativo_id?: number | null
          motivo?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_codigo_retirado_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_codigo_retirado_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "contable_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_cuenta: {
        Row: {
          activa: boolean
          clase: number
          codigo: string
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel: number
          nombre: string
          parent_id: string | null
          permite_movimiento: boolean
          plan_cuenta_id: string | null
          requiere_centro_costo: boolean
          requiere_fondo: boolean
          requiere_inmueble: boolean
          requiere_tercero: boolean
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          clase?: number
          codigo: string
          created_at?: string
          id?: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel?: number
          nombre: string
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_cuenta_id?: string | null
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          clase?: number
          codigo?: string
          created_at?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel?: number
          nombre?: string
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_cuenta_id?: string | null
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_cuenta_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_plan_cuenta_id_fkey"
            columns: ["plan_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_plan_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_cuenta_default: {
        Row: {
          contable_cuenta_id: string
          created_at: string
          evento_id: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          contable_cuenta_id: string
          created_at?: string
          evento_id: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          contable_cuenta_id?: string
          created_at?: string
          evento_id?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_cuenta_default_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_default_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_default_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_default_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_plan: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          version: number
          vigente: boolean
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          version?: number
          vigente?: boolean
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          version?: number
          vigente?: boolean
        }
        Relationships: []
      }
      contable_plan_cuenta: {
        Row: {
          clase: number
          codigo: string
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel: number
          nombre: string
          opcional: boolean
          parent_id: string | null
          permite_movimiento: boolean
          plan_id: string
          requiere_centro_costo: boolean
          requiere_fondo: boolean
          requiere_inmueble: boolean
          requiere_tercero: boolean
        }
        Insert: {
          clase?: number
          codigo: string
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel?: number
          nombre: string
          opcional?: boolean
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_id: string
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
        }
        Update: {
          clase?: number
          codigo?: string
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          naturaleza?: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel?: number
          nombre?: string
          opcional?: boolean
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_id?: string
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contable_plan_cuenta_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_plan_cuenta_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contable_plan_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_plan_cuenta_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "contable_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      costas_judiciales: {
        Row: {
          autoridad: string
          caso_id: string
          created_at: string
          documento_fuente: string
          estado: Database["public"]["Enums"]["estado_costa_t"]
          fecha_decision: string
          id: string
          monto: number
          monto_recuperado: number
          registrada_por: string | null
          tenant_id: string
          tipo_costa: Database["public"]["Enums"]["tipo_costa_t"]
        }
        Insert: {
          autoridad: string
          caso_id: string
          created_at?: string
          documento_fuente: string
          estado?: Database["public"]["Enums"]["estado_costa_t"]
          fecha_decision: string
          id?: string
          monto: number
          monto_recuperado?: number
          registrada_por?: string | null
          tenant_id: string
          tipo_costa: Database["public"]["Enums"]["tipo_costa_t"]
        }
        Update: {
          autoridad?: string
          caso_id?: string
          created_at?: string
          documento_fuente?: string
          estado?: Database["public"]["Enums"]["estado_costa_t"]
          fecha_decision?: string
          id?: string
          monto?: number
          monto_recuperado?: number
          registrada_por?: string | null
          tenant_id?: string
          tipo_costa?: Database["public"]["Enums"]["tipo_costa_t"]
        }
        Relationships: [
          {
            foreignKeyName: "costas_judiciales_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_bancarias: {
        Row: {
          activa: boolean
          contable_cuenta_id: string | null
          created_at: string
          entidad_financiera_id: number
          es_recaudo: boolean
          id: string
          numero_cuenta: string
          tenant_id: string
          tipo_cuenta: Database["public"]["Enums"]["cuenta_bancaria_tipo_t"]
          titular: string | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          contable_cuenta_id?: string | null
          created_at?: string
          entidad_financiera_id: number
          es_recaudo?: boolean
          id?: string
          numero_cuenta: string
          tenant_id: string
          tipo_cuenta: Database["public"]["Enums"]["cuenta_bancaria_tipo_t"]
          titular?: string | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          contable_cuenta_id?: string | null
          created_at?: string
          entidad_financiera_id?: number
          es_recaudo?: boolean
          id?: string
          numero_cuenta?: string
          tenant_id?: string
          tipo_cuenta?: Database["public"]["Enums"]["cuenta_bancaria_tipo_t"]
          titular?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_bancarias_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_entidad_financiera_id_fkey"
            columns: ["entidad_financiera_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          busqueda_tsv: unknown
          caso_juridico_id: string | null
          created_at: string
          descripcion: string | null
          fecha_vencimiento: string | null
          grupo_id: string
          id: string
          inmueble_id: string | null
          nombre_archivo: string
          storage_path: string
          subido_por: string | null
          tamano_bytes: number | null
          tenant_id: string
          tipo_documento_id: number
          version: number
        }
        Insert: {
          busqueda_tsv?: unknown
          caso_juridico_id?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_vencimiento?: string | null
          grupo_id?: string
          id?: string
          inmueble_id?: string | null
          nombre_archivo: string
          storage_path: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id: string
          tipo_documento_id: number
          version?: number
        }
        Update: {
          busqueda_tsv?: unknown
          caso_juridico_id?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_vencimiento?: string | null
          grupo_id?: string
          id?: string
          inmueble_id?: string | null
          nombre_archivo?: string
          storage_path?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id?: string
          tipo_documento_id?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_caso_juridico_id_fkey"
            columns: ["caso_juridico_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tipo_documento_id_fkey"
            columns: ["tipo_documento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          brevo_template_id: number | null
          created_at: string
          event_type: string
          html_content: string
          id: string
          is_synced: boolean
          last_synced_at: string | null
          subject: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          brevo_template_id?: number | null
          created_at?: string
          event_type: string
          html_content: string
          id?: string
          is_synced?: boolean
          last_synced_at?: string | null
          subject: string
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          brevo_template_id?: number | null
          created_at?: string
          event_type?: string
          html_content?: string
          id?: string
          is_synced?: boolean
          last_synced_at?: string | null
          subject?: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estados_cuenta_generados: {
        Row: {
          created_at: string
          datos: Json
          folio: string | null
          generado_por: string | null
          id: string
          inmueble_id: string
          liquidacion_id: string | null
          periodo_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          datos: Json
          folio?: string | null
          generado_por?: string | null
          id?: string
          inmueble_id: string
          liquidacion_id?: string | null
          periodo_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          datos?: Json
          folio?: string | null
          generado_por?: string | null
          id?: string
          inmueble_id?: string
          liquidacion_id?: string | null
          periodo_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estados_cuenta_generados_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estrategias_cobranza: {
        Row: {
          activa: boolean
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          codigo: string
          created_at: string
          dias_desde_clasificacion: number
          frecuencia_dias: number | null
          id: string
          max_intentos: number
          monto_minimo_deuda: number | null
          nombre: string
          orden: number
          plantilla_codigo: string | null
          politica_id: string
          requiere_aprobacion: boolean
          rol_minimo: Database["public"]["Enums"]["tenant_role_t"]
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          tramo_id: string
        }
        Insert: {
          activa?: boolean
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          codigo: string
          created_at?: string
          dias_desde_clasificacion?: number
          frecuencia_dias?: number | null
          id?: string
          max_intentos?: number
          monto_minimo_deuda?: number | null
          nombre: string
          orden: number
          plantilla_codigo?: string | null
          politica_id: string
          requiere_aprobacion?: boolean
          rol_minimo?: Database["public"]["Enums"]["tenant_role_t"]
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          tramo_id: string
        }
        Update: {
          activa?: boolean
          canal?: Database["public"]["Enums"]["canal_cobranza_t"]
          codigo?: string
          created_at?: string
          dias_desde_clasificacion?: number
          frecuencia_dias?: number | null
          id?: string
          max_intentos?: number
          monto_minimo_deuda?: number | null
          nombre?: string
          orden?: number
          plantilla_codigo?: string | null
          politica_id?: string
          requiere_aprobacion?: boolean
          rol_minimo?: Database["public"]["Enums"]["tenant_role_t"]
          tenant_id?: string
          tipo_accion?: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          tramo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estrategias_cobranza_politica_id_fkey"
            columns: ["politica_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategias_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategias_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategias_cobranza_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "politica_clasificacion_tramos"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_cartera: {
        Row: {
          actor_id: string | null
          created_at: string
          dedup_key: string | null
          ejecucion_id: string | null
          entidad_id: string | null
          entidad_tipo: string | null
          estado_anterior: Json | null
          estado_nuevo: Json | null
          fecha_corte: string
          id: string
          inmueble_id: string | null
          motivo: string
          ocurrido_at: string
          origen: Database["public"]["Enums"]["origen_evento_t"]
          politica_id: string | null
          politica_version: number | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_evento_cartera_t"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dedup_key?: string | null
          ejecucion_id?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado_anterior?: Json | null
          estado_nuevo?: Json | null
          fecha_corte: string
          id?: string
          inmueble_id?: string | null
          motivo: string
          ocurrido_at?: string
          origen: Database["public"]["Enums"]["origen_evento_t"]
          politica_id?: string | null
          politica_version?: number | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_evento_cartera_t"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dedup_key?: string | null
          ejecucion_id?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado_anterior?: Json | null
          estado_nuevo?: Json | null
          fecha_corte?: string
          id?: string
          inmueble_id?: string | null
          motivo?: string
          ocurrido_at?: string
          origen?: Database["public"]["Enums"]["origen_evento_t"]
          politica_id?: string | null
          politica_version?: number | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["tipo_evento_cartera_t"]
        }
        Relationships: [
          {
            foreignKeyName: "eventos_cartera_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_movimientos: {
        Row: {
          autorizado_por: string | null
          created_at: string
          descripcion: string | null
          fondo_id: string
          id: string
          liquidacion_id: string | null
          monto: number
          periodo_id: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Insert: {
          autorizado_por?: string | null
          created_at?: string
          descripcion?: string | null
          fondo_id: string
          id?: string
          liquidacion_id?: string | null
          monto: number
          periodo_id?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Update: {
          autorizado_por?: string | null
          created_at?: string
          descripcion?: string | null
          fondo_id?: string
          id?: string
          liquidacion_id?: string | null
          monto?: number
          periodo_id?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Relationships: [
          {
            foreignKeyName: "fondo_movimientos_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondos: {
        Row: {
          contable_cuenta_id: string | null
          created_at: string
          id: string
          nombre: string
          saldo_actual: number
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_tipo_t"]
          updated_at: string | null
        }
        Insert: {
          contable_cuenta_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          saldo_actual?: number
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_tipo_t"]
          updated_at?: string | null
        }
        Update: {
          contable_cuenta_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          saldo_actual?: number
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fondo_tipo_t"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fondos_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fuente_financiacion: {
        Row: {
          created_at: string
          descripcion: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_cuenta_id: string | null
          presupuesto_id: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          valor_aplicado: number
          valor_disponible: number
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_cuenta_id?: string | null
          presupuesto_id: string
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible: number
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_cuenta_id?: string | null
          presupuesto_id?: string
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible?: number
        }
        Relationships: [
          {
            foreignKeyName: "fuente_financiacion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamento_normativo: {
        Row: {
          articulo: string | null
          created_at: string
          descripcion: string | null
          fecha_validacion: string | null
          fecha_vigencia: string | null
          fuente_url: string | null
          id: number
          norma: string
          referencia: string | null
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at: string | null
          validado_por: string | null
        }
        Insert: {
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_validacion?: string | null
          fecha_vigencia?: string | null
          fuente_url?: string | null
          id?: never
          norma: string
          referencia?: string | null
          tenant_id?: string | null
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at?: string | null
          validado_por?: string | null
        }
        Update: {
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_validacion?: string | null
          fecha_vigencia?: string | null
          fuente_url?: string | null
          id?: never
          norma?: string
          referencia?: string | null
          tenant_id?: string | null
          tipo?: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fundamento_normativo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamento_normativo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inmueble_persona_rol: {
        Row: {
          created_at: string
          es_pagador: boolean
          id: string
          inmueble_id: string
          porcentaje: number | null
          recibe_notificaciones: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          es_pagador?: boolean
          id?: string
          inmueble_id: string
          porcentaje?: number | null
          recibe_notificaciones?: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          es_pagador?: boolean
          id?: string
          inmueble_id?: string
          porcentaje?: number | null
          recibe_notificaciones?: boolean
          rol_id?: number
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inmueble_persona_rol_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      inmuebles: {
        Row: {
          activo_desde: string | null
          agrupacion_id: string | null
          area_comun: number | null
          area_privada: number | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          estado: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id: number | null
          estado_legal_observaciones: string | null
          gravamen_tipo_id: number | null
          habitabilidad_id: number | null
          id: string
          inactivo_desde: string | null
          matricula_inmobiliaria: string | null
          referencia_catastral: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          uso_predio_id: number | null
        }
        Insert: {
          activo_desde?: string | null
          agrupacion_id?: string | null
          area_comun?: number | null
          area_privada?: number | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          estado?: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          gravamen_tipo_id?: number | null
          habitabilidad_id?: number | null
          id?: string
          inactivo_desde?: string | null
          matricula_inmobiliaria?: string | null
          referencia_catastral?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          uso_predio_id?: number | null
        }
        Update: {
          activo_desde?: string | null
          agrupacion_id?: string | null
          area_comun?: number | null
          area_privada?: number | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          gravamen_tipo_id?: number | null
          habitabilidad_id?: number | null
          id?: string
          inactivo_desde?: string | null
          matricula_inmobiliaria?: string | null
          referencia_catastral?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          uso_predio_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inmuebles_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_estado_legal_id_fkey"
            columns: ["estado_legal_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_gravamen_tipo_id_fkey"
            columns: ["gravamen_tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_habitabilidad_id_fkey"
            columns: ["habitabilidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_uso_predio_id_fkey"
            columns: ["uso_predio_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["invite_status_t"]
          tenant_id?: string
          token_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidacion_lineas: {
        Row: {
          concepto_id: string
          created_at: string
          id: string
          inmueble_id: string
          liquidacion_id: string
          monto: number
          tenant_id: string
        }
        Insert: {
          concepto_id: string
          created_at?: string
          id?: string
          inmueble_id: string
          liquidacion_id: string
          monto: number
          tenant_id: string
        }
        Update: {
          concepto_id?: string
          created_at?: string
          id?: string
          inmueble_id?: string
          liquidacion_id?: string
          monto?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidacion_lineas_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones: {
        Row: {
          anulada_at: string | null
          anulada_por: string | null
          aplicada_at: string | null
          aprobada_at: string | null
          aprobada_por: string | null
          avisos_aceptados: Json | null
          created_at: string
          estado: Database["public"]["Enums"]["liquidacion_estado_t"]
          id: string
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          nota_solicitud: string | null
          periodo_id: string
          propuesta_at: string | null
          propuesta_por: string | null
          result_hash: string
          sello_datos: string | null
          simulada_at: string
          simulada_por: string | null
          snapshot: Json | null
          snapshot_hash: string | null
          tenant_id: string
          tenant_total: number
          updated_at: string | null
        }
        Insert: {
          anulada_at?: string | null
          anulada_por?: string | null
          aplicada_at?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          avisos_aceptados?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["liquidacion_estado_t"]
          id?: string
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          nota_solicitud?: string | null
          periodo_id: string
          propuesta_at?: string | null
          propuesta_por?: string | null
          result_hash: string
          sello_datos?: string | null
          simulada_at?: string
          simulada_por?: string | null
          snapshot?: Json | null
          snapshot_hash?: string | null
          tenant_id: string
          tenant_total: number
          updated_at?: string | null
        }
        Update: {
          anulada_at?: string | null
          anulada_por?: string | null
          aplicada_at?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          avisos_aceptados?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["liquidacion_estado_t"]
          id?: string
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          nota_solicitud?: string | null
          periodo_id?: string
          propuesta_at?: string | null
          propuesta_por?: string | null
          result_hash?: string
          sello_datos?: string | null
          simulada_at?: string
          simulada_por?: string | null
          snapshot?: Json | null
          snapshot_hash?: string | null
          tenant_id?: string
          tenant_total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_propuesta_por_fkey"
            columns: ["propuesta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_simulada_por_fkey"
            columns: ["simulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_tipos: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          id: number
          nombre: string
          orden: number
          tenant_id: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre: string
          orden?: number
          tenant_id?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre?: string
          orden?: number
          tenant_id?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_tipos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_tipo_fkey"
            columns: ["tipo"]
            isOneToOne: false
            referencedRelation: "tipos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      lista_tipos_ocultos: {
        Row: {
          created_at: string
          lista_tipos_id: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          lista_tipos_id: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          lista_tipos_id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_tipos_ocultos_lista_tipos_id_fkey"
            columns: ["lista_tipos_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_ocultos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_ocultos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles_funcionales: {
        Row: {
          asignado_en: string
          asignado_por: string | null
          id: string
          membership_id: string
          rol_funcional_id: number
        }
        Insert: {
          asignado_en?: string
          asignado_por?: string | null
          id?: string
          membership_id: string
          rol_funcional_id: number
        }
        Update: {
          asignado_en?: string
          asignado_por?: string | null
          id?: string
          membership_id?: string
          rol_funcional_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_funcionales_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_funcionales_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_funcionales_rol_funcional_id_fkey"
            columns: ["rol_funcional_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["member_status_t"]
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["member_status_t"]
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["member_status_t"]
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      novedad_cuotas: {
        Row: {
          cargo_id: string | null
          generada_at: string | null
          id: string
          monto_cuota: number
          novedad_id: string
          numero_cuota: number
          periodo_id: string | null
          tenant_id: string
        }
        Insert: {
          cargo_id?: string | null
          generada_at?: string | null
          id?: string
          monto_cuota: number
          novedad_id: string
          numero_cuota: number
          periodo_id?: string | null
          tenant_id: string
        }
        Update: {
          cargo_id?: string | null
          generada_at?: string | null
          id?: string
          monto_cuota?: number
          novedad_id?: string
          numero_cuota?: number
          periodo_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "novedad_cuotas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      novedad_tipo_cuenta: {
        Row: {
          created_at: string
          presupuesto_cuenta_id: string
          tenant_id: string
          tipo_novedad_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          presupuesto_cuenta_id: string
          tenant_id: string
          tipo_novedad_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          presupuesto_cuenta_id?: string
          tenant_id?: string
          tipo_novedad_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "novedad_tipo_cuenta_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_tipo_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_tipo_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_tipo_cuenta_tipo_novedad_id_fkey"
            columns: ["tipo_novedad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      novedades: {
        Row: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        Insert: {
          acuerdo_pago_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          busqueda_tsv?: unknown
          concepto_id?: string | null
          created_at?: string
          created_by: string
          cuotas_totales?: number | null
          descripcion: string
          estado?: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id?: string
          inhabilitada_at?: string | null
          inhabilitada_por?: string | null
          inmueble_id: string
          monto: number
          permanente?: boolean
          presupuesto_cuenta_id?: string | null
          prorrateable?: boolean
          rejected_reason?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id?: number | null
        }
        Update: {
          acuerdo_pago_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          busqueda_tsv?: unknown
          concepto_id?: string | null
          created_at?: string
          created_by?: string
          cuotas_totales?: number | null
          descripcion?: string
          estado?: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva?: string
          id?: string
          inhabilitada_at?: string | null
          inhabilitada_por?: string | null
          inmueble_id?: string
          monto?: number
          permanente?: boolean
          presupuesto_cuenta_id?: string | null
          prorrateable?: boolean
          rejected_reason?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "novedades_acuerdo_pago_id_fkey"
            columns: ["acuerdo_pago_id"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_inhabilitada_por_fkey"
            columns: ["inhabilitada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_tipo_novedad_id_fkey"
            columns: ["tipo_novedad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      pago_aplicaciones: {
        Row: {
          cargo_id: string
          created_at: string
          id: string
          monto: number
          pago_id: string
          tenant_id: string
        }
        Insert: {
          cargo_id: string
          created_at?: string
          id?: string
          monto: number
          pago_id: string
          tenant_id: string
        }
        Update: {
          cargo_id?: string
          created_at?: string
          id?: string
          monto?: number
          pago_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_aplicaciones_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          acuerdo_cuota_id: string | null
          created_at: string
          fecha_pago: string
          id: string
          inmueble_id: string
          monto: number
          referencia: string | null
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          acuerdo_cuota_id?: string | null
          created_at?: string
          fecha_pago: string
          id?: string
          inmueble_id: string
          monto: number
          referencia?: string | null
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          acuerdo_cuota_id?: string | null
          created_at?: string
          fecha_pago?: string
          id?: string
          inmueble_id?: string
          monto?: number
          referencia?: string | null
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_acuerdo_cuota_id_fkey"
            columns: ["acuerdo_cuota_id"]
            isOneToOne: false
            referencedRelation: "acuerdo_pago_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      periodos: {
        Row: {
          anio: number
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento: string | null
          id: string
          mes: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento?: string | null
          id?: string
          mes: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento?: string | null
          id?: string
          mes?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "periodos_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas_sms: {
        Row: {
          activo: boolean
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuerpo: string
          event_type: string
          id?: string
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuerpo?: string
          event_type?: string
          id?: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_sms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      politica_clasificacion_tramos: {
        Row: {
          codigo: string
          created_at: string
          dias_max: number | null
          dias_min: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          id: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          nombre: string
          orden: number
          politica_id: string
          prioridad: number
          tenant_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          dias_max?: number | null
          dias_min: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          id?: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          nombre: string
          orden: number
          politica_id: string
          prioridad: number
          tenant_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          dias_max?: number | null
          dias_min?: number
          etapa_cobranza?: Database["public"]["Enums"]["etapa_cobranza_t"]
          id?: string
          nivel_riesgo?: Database["public"]["Enums"]["nivel_riesgo_t"]
          nombre?: string
          orden?: number
          politica_id?: string
          prioridad?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "politica_clasificacion_tramos_politica_id_fkey"
            columns: ["politica_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politica_clasificacion_tramos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politica_clasificacion_tramos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      politicas_clasificacion_cartera: {
        Row: {
          acta_referencia: string | null
          aprobada_por: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          nombre: string
          policy_hash: string
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          acta_referencia?: string | null
          aprobada_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          nombre: string
          policy_hash: string
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          acta_referencia?: string | null
          aprobada_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          nombre?: string
          policy_hash?: string
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politicas_clasificacion_cartera_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_clasificacion_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_clasificacion_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      politicas_financieras: {
        Row: {
          coeficientes_suma_esperada: number
          created_at: string
          descuento_pronto_pago_dias: number
          descuento_pronto_pago_modo: Database["public"]["Enums"]["descuento_pronto_pago_modo_t"]
          descuento_pronto_pago_porcentaje: number
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          fondo_imprevistos_base:
            | Database["public"]["Enums"]["fondo_base_calculo_t"]
            | null
          fondo_imprevistos_porcentaje: number | null
          id: string
          imputacion_estrategia: Database["public"]["Enums"]["politica_imputacion_estrategia_t"]
          imputacion_orden: Json
          interes_day_count: Database["public"]["Enums"]["interes_day_count_t"]
          interes_descuento_orden: Database["public"]["Enums"]["interes_descuento_orden_t"]
          interes_dias_gracia: number
          interes_multiplicador: number | null
          interes_tasa_mensual: number | null
          interes_tipo_tasa:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual: number | null
          policy_hash: string
          reconocimiento_ingreso: Database["public"]["Enums"]["presupuesto_reconocimiento_ingreso_t"]
          redondeo_escala: number
          redondeo_modo: Database["public"]["Enums"]["redondeo_modo_t"]
          residual_metodo: Database["public"]["Enums"]["residual_metodo_t"]
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          coeficientes_suma_esperada?: number
          created_at?: string
          descuento_pronto_pago_dias?: number
          descuento_pronto_pago_modo?: Database["public"]["Enums"]["descuento_pronto_pago_modo_t"]
          descuento_pronto_pago_porcentaje?: number
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          fondo_imprevistos_base?:
            | Database["public"]["Enums"]["fondo_base_calculo_t"]
            | null
          fondo_imprevistos_porcentaje?: number | null
          id?: string
          imputacion_estrategia?: Database["public"]["Enums"]["politica_imputacion_estrategia_t"]
          imputacion_orden?: Json
          interes_day_count?: Database["public"]["Enums"]["interes_day_count_t"]
          interes_descuento_orden?: Database["public"]["Enums"]["interes_descuento_orden_t"]
          interes_dias_gracia?: number
          interes_multiplicador?: number | null
          interes_tasa_mensual?: number | null
          interes_tipo_tasa?:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual?: number | null
          policy_hash: string
          reconocimiento_ingreso?: Database["public"]["Enums"]["presupuesto_reconocimiento_ingreso_t"]
          redondeo_escala?: number
          redondeo_modo?: Database["public"]["Enums"]["redondeo_modo_t"]
          residual_metodo?: Database["public"]["Enums"]["residual_metodo_t"]
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          coeficientes_suma_esperada?: number
          created_at?: string
          descuento_pronto_pago_dias?: number
          descuento_pronto_pago_modo?: Database["public"]["Enums"]["descuento_pronto_pago_modo_t"]
          descuento_pronto_pago_porcentaje?: number
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          fondo_imprevistos_base?:
            | Database["public"]["Enums"]["fondo_base_calculo_t"]
            | null
          fondo_imprevistos_porcentaje?: number | null
          id?: string
          imputacion_estrategia?: Database["public"]["Enums"]["politica_imputacion_estrategia_t"]
          imputacion_orden?: Json
          interes_day_count?: Database["public"]["Enums"]["interes_day_count_t"]
          interes_descuento_orden?: Database["public"]["Enums"]["interes_descuento_orden_t"]
          interes_dias_gracia?: number
          interes_multiplicador?: number | null
          interes_tasa_mensual?: number | null
          interes_tipo_tasa?:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual?: number | null
          policy_hash?: string
          reconocimiento_ingreso?: Database["public"]["Enums"]["presupuesto_reconocimiento_ingreso_t"]
          redondeo_escala?: number
          redondeo_modo?: Database["public"]["Enums"]["redondeo_modo_t"]
          residual_metodo?: Database["public"]["Enums"]["residual_metodo_t"]
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politicas_financieras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_financieras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      posiciones_cartera_snapshot: {
        Row: {
          cantidad_cargos_vencidos: number
          cargo_vencido_mas_antiguo_id: string | null
          clasificacion_codigo: string
          created_at: string
          deuda_capital: number
          deuda_interes: number
          deuda_otros: number
          deuda_total: number
          dias_mora_maximo: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          fecha_corte: string
          fecha_vencimiento_mas_antigua: string | null
          id: string
          inmueble_id: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          politica_clasificacion_id: string
          politica_version: number
          posicion_hash: string
          saldo_credito: number
          tenant_id: string
        }
        Insert: {
          cantidad_cargos_vencidos?: number
          cargo_vencido_mas_antiguo_id?: string | null
          clasificacion_codigo: string
          created_at?: string
          deuda_capital: number
          deuda_interes: number
          deuda_otros: number
          deuda_total: number
          dias_mora_maximo: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          fecha_corte: string
          fecha_vencimiento_mas_antigua?: string | null
          id?: string
          inmueble_id: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          politica_clasificacion_id: string
          politica_version: number
          posicion_hash: string
          saldo_credito?: number
          tenant_id: string
        }
        Update: {
          cantidad_cargos_vencidos?: number
          cargo_vencido_mas_antiguo_id?: string | null
          clasificacion_codigo?: string
          created_at?: string
          deuda_capital?: number
          deuda_interes?: number
          deuda_otros?: number
          deuda_total?: number
          dias_mora_maximo?: number
          etapa_cobranza?: Database["public"]["Enums"]["etapa_cobranza_t"]
          fecha_corte?: string
          fecha_vencimiento_mas_antigua?: string | null
          id?: string
          inmueble_id?: string
          nivel_riesgo?: Database["public"]["Enums"]["nivel_riesgo_t"]
          politica_clasificacion_id?: string
          politica_version?: number
          posicion_hash?: string
          saldo_credito?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posiciones_cartera_snapshot_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_politica_clasificacion_id_fkey"
            columns: ["politica_clasificacion_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_cuenta: {
        Row: {
          activa: boolean
          busqueda_tsv: unknown
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          es_hoja: boolean
          id: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel: number
          nombre: string
          orden: number
          parent_id: string | null
          ruta: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          busqueda_tsv?: unknown
          codigo: string
          contable_cuenta_id?: string | null
          created_at?: string
          es_hoja?: boolean
          id?: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel?: number
          nombre: string
          orden?: number
          parent_id?: string | null
          ruta?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          busqueda_tsv?: unknown
          codigo?: string
          contable_cuenta_id?: string | null
          created_at?: string
          es_hoja?: boolean
          id?: string
          naturaleza?: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel?: number
          nombre?: string
          orden?: number
          parent_id?: string | null
          ruta?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_cuenta_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cuenta_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_cuenta_plantilla: {
        Row: {
          codigo: string
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel: number
          nombre: string
          orden: number
          parent_id: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel: number
          nombre: string
          orden?: number
          parent_id?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel?: number
          nombre?: string
          orden?: number
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_cuenta_plantilla_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta_plantilla"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_ejecucion: {
        Row: {
          agrupacion_id: string | null
          ajusta_movimiento_id: string | null
          centro_costo_id: number | null
          created_at: string
          cuenta_bancaria_id: string | null
          cuenta_id: string
          descripcion: string | null
          fecha_documento: string | null
          id: string
          liquidacion: Database["public"]["Enums"]["ejecucion_liquidacion_t"]
          monto: number
          periodo_id: string
          referencia: string | null
          registrado_por: string | null
          tenant_id: string
          tercero_id: string | null
        }
        Insert: {
          agrupacion_id?: string | null
          ajusta_movimiento_id?: string | null
          centro_costo_id?: number | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          cuenta_id: string
          descripcion?: string | null
          fecha_documento?: string | null
          id?: string
          liquidacion: Database["public"]["Enums"]["ejecucion_liquidacion_t"]
          monto: number
          periodo_id: string
          referencia?: string | null
          registrado_por?: string | null
          tenant_id: string
          tercero_id?: string | null
        }
        Update: {
          agrupacion_id?: string | null
          ajusta_movimiento_id?: string | null
          centro_costo_id?: number | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          cuenta_id?: string
          descripcion?: string | null
          fecha_documento?: string | null
          id?: string
          liquidacion?: Database["public"]["Enums"]["ejecucion_liquidacion_t"]
          monto?: number
          periodo_id?: string
          referencia?: string | null
          registrado_por?: string | null
          tenant_id?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_ejecucion_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_ajusta_movimiento_id_fkey"
            columns: ["ajusta_movimiento_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_ejecucion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_rubros: {
        Row: {
          agrupacion_id: string | null
          centro_costo_id: number | null
          codigo: string
          created_at: string
          cuenta_id: string
          fundamento_normativo_id: number | null
          id: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          agrupacion_id?: string | null
          centro_costo_id?: number | null
          codigo: string
          created_at?: string
          cuenta_id: string
          fundamento_normativo_id?: number | null
          id?: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          agrupacion_id?: string | null
          centro_costo_id?: number | null
          codigo?: string
          created_at?: string
          cuenta_id?: string
          fundamento_normativo_id?: number | null
          id?: string
          monto_anual?: number
          nombre?: string
          presupuesto_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_rubros_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          acta_asamblea: string | null
          anio: number
          created_at: string
          estado: Database["public"]["Enums"]["presupuesto_estado_t"]
          fecha_aprobacion: string | null
          id: string
          monto_total: number
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          acta_asamblea?: string | null
          anio: number
          created_at?: string
          estado?: Database["public"]["Enums"]["presupuesto_estado_t"]
          fecha_aprobacion?: string | null
          id?: string
          monto_total: number
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          acta_asamblea?: string | null
          anio?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["presupuesto_estado_t"]
          fecha_aprobacion?: string | null
          id?: string
          monto_total?: number
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          phone: string | null
          status: Database["public"]["Enums"]["user_status_t"]
          updated_at: string | null
        }
        Insert: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status_t"]
          updated_at?: string | null
        }
        Update: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status_t"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promesas_pago: {
        Row: {
          accion_cobranza_id: string | null
          created_at: string
          cumplida_at: string | null
          estado: Database["public"]["Enums"]["estado_promesa_t"]
          fecha_pago_prometida: string
          fecha_promesa: string
          id: string
          inmueble_id: string
          monto_cumplido: number | null
          monto_prometido: number
          notas: string | null
          pago_id: string | null
          registrada_por: string | null
          tenant_id: string
        }
        Insert: {
          accion_cobranza_id?: string | null
          created_at?: string
          cumplida_at?: string | null
          estado?: Database["public"]["Enums"]["estado_promesa_t"]
          fecha_pago_prometida: string
          fecha_promesa: string
          id?: string
          inmueble_id: string
          monto_cumplido?: number | null
          monto_prometido: number
          notas?: string | null
          pago_id?: string | null
          registrada_por?: string | null
          tenant_id: string
        }
        Update: {
          accion_cobranza_id?: string | null
          created_at?: string
          cumplida_at?: string | null
          estado?: Database["public"]["Enums"]["estado_promesa_t"]
          fecha_pago_prometida?: string
          fecha_promesa?: string
          id?: string
          inmueble_id?: string
          monto_cumplido?: number | null
          monto_prometido?: number
          notas?: string | null
          pago_id?: string | null
          registrada_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promesas_pago_accion_cobranza_id_fkey"
            columns: ["accion_cobranza_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
        }
        Relationships: []
      }
      rol_funcional_modulo: {
        Row: {
          lista_tipos_id: number
          modulo: string
        }
        Insert: {
          lista_tipos_id: number
          modulo: string
        }
        Update: {
          lista_tipos_id?: number
          modulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_funcional_modulo_lista_tipos_id_fkey"
            columns: ["lista_tipos_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      tasas_referencia: {
        Row: {
          created_at: string
          entidad_fuente: string
          id: string
          registrada_por: string | null
          resolucion_fecha: string
          resolucion_numero: string
          tipo_tasa: Database["public"]["Enums"]["tipo_tasa_referencia_t"]
          url_fuente: string | null
          valor_ea: number
          valor_mensual: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          entidad_fuente?: string
          id?: string
          registrada_por?: string | null
          resolucion_fecha: string
          resolucion_numero: string
          tipo_tasa: Database["public"]["Enums"]["tipo_tasa_referencia_t"]
          url_fuente?: string | null
          valor_ea: number
          valor_mensual: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          entidad_fuente?: string
          id?: string
          registrada_por?: string | null
          resolucion_fecha?: string
          resolucion_numero?: string
          tipo_tasa?: Database["public"]["Enums"]["tipo_tasa_referencia_t"]
          url_fuente?: string | null
          valor_ea?: number
          valor_mensual?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasas_referencia_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_tercero_rol: {
        Row: {
          created_at: string
          id: string
          numero_tarjeta_profesional: string | null
          recibe_notificaciones: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          numero_tarjeta_profesional?: string | null
          recibe_notificaciones?: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          numero_tarjeta_profesional?: string | null
          recibe_notificaciones?: boolean
          rol_id?: number
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_tercero_rol_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tercero_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tercero_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tercero_rol_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          canal_notificacion: string | null
          ciudad: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          dia_facturacion: number | null
          direccion: string | null
          email: string | null
          id: string
          logo_path: string | null
          logo_storage_path: string | null
          moneda: string
          name: string
          nit: string | null
          nit_digito_verificacion: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1: string | null
          telefono_2: string | null
          tipo_division_id: number
          updated_at: string | null
          zona_horaria: string
        }
        Insert: {
          canal_notificacion?: string | null
          ciudad?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          dia_facturacion?: number | null
          direccion?: string | null
          email?: string | null
          id?: string
          logo_path?: string | null
          logo_storage_path?: string | null
          moneda?: string
          name: string
          nit?: string | null
          nit_digito_verificacion?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1?: string | null
          telefono_2?: string | null
          tipo_division_id?: number
          updated_at?: string | null
          zona_horaria?: string
        }
        Update: {
          canal_notificacion?: string | null
          ciudad?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          dia_facturacion?: number | null
          direccion?: string | null
          email?: string | null
          id?: string
          logo_path?: string | null
          logo_storage_path?: string | null
          moneda?: string
          name?: string
          nit?: string | null
          nit_digito_verificacion?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1?: string | null
          telefono_2?: string | null
          tipo_division_id?: number
          updated_at?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_tipo_division_id_fkey"
            columns: ["tipo_division_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      terceros: {
        Row: {
          busqueda_tsv: unknown
          created_at: string
          digito_verificacion: string | null
          direccion: string | null
          email: string | null
          estado_id: number
          id: string
          nombre_completo: string | null
          numero_documento: string
          pagador_id: string | null
          primer_apellido: string | null
          primer_nombre: string | null
          razon_social: string | null
          representante_legal_id: string | null
          segundo_apellido: string | null
          segundo_nombre: string | null
          telefono: string | null
          tenant_id: string
          tipo_identificacion_id: number
          tipo_persona: Database["public"]["Enums"]["tercero_tipo_t"]
          updated_at: string | null
        }
        Insert: {
          busqueda_tsv?: unknown
          created_at?: string
          digito_verificacion?: string | null
          direccion?: string | null
          email?: string | null
          estado_id: number
          id?: string
          nombre_completo?: string | null
          numero_documento: string
          pagador_id?: string | null
          primer_apellido?: string | null
          primer_nombre?: string | null
          razon_social?: string | null
          representante_legal_id?: string | null
          segundo_apellido?: string | null
          segundo_nombre?: string | null
          telefono?: string | null
          tenant_id: string
          tipo_identificacion_id: number
          tipo_persona: Database["public"]["Enums"]["tercero_tipo_t"]
          updated_at?: string | null
        }
        Update: {
          busqueda_tsv?: unknown
          created_at?: string
          digito_verificacion?: string | null
          direccion?: string | null
          email?: string | null
          estado_id?: number
          id?: string
          nombre_completo?: string | null
          numero_documento?: string
          pagador_id?: string | null
          primer_apellido?: string | null
          primer_nombre?: string | null
          razon_social?: string | null
          representante_legal_id?: string | null
          segundo_apellido?: string | null
          segundo_nombre?: string | null
          telefono?: string | null
          tenant_id?: string
          tipo_identificacion_id?: number
          tipo_persona?: Database["public"]["Enums"]["tercero_tipo_t"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terceros_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_pagador_id_fkey"
            columns: ["pagador_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_representante_legal_id_fkey"
            columns: ["representante_legal_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_tipo_identificacion_id_fkey"
            columns: ["tipo_identificacion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          id: number
          nombre: string
          updated_at: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre: string
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      zonas_comunes: {
        Row: {
          activa: boolean
          area: number | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          descripcion: string | null
          es_esencial: boolean
          id: string
          matricula_inmobiliaria: string | null
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          uso_exclusivo_inmueble_id: string | null
        }
        Insert: {
          activa?: boolean
          area?: number | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          descripcion?: string | null
          es_esencial?: boolean
          id?: string
          matricula_inmobiliaria?: string | null
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Update: {
          activa?: boolean
          area?: number | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          descripcion?: string | null
          es_esencial?: boolean
          id?: string
          matricula_inmobiliaria?: string | null
          nombre?: string
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zonas_comunes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_uso_exclusivo_inmueble_id_fkey"
            columns: ["uso_exclusivo_inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_uso_exclusivo_inmueble_id_fkey"
            columns: ["uso_exclusivo_inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      platform_tenant_overview: {
        Row: {
          created_at: string | null
          id: string | null
          last_activity_at: string | null
          member_count: number | null
          name: string | null
          slug: string | null
          status: Database["public"]["Enums"]["tenant_status_t"] | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          member_count?: never
          name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["tenant_status_t"] | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          member_count?: never
          name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["tenant_status_t"] | null
        }
        Relationships: []
      }
      v_cargo_saldo: {
        Row: {
          cargo_capital_origen_id: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"] | null
          concepto_id: string | null
          created_at: string | null
          fecha_vencimiento: string | null
          id: string | null
          inmueble_id: string | null
          liquidacion_linea_id: string | null
          monto_original: number | null
          monto_pendiente: number | null
          novedad_id: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"] | null
          periodo_id: string | null
          tenant_id: string | null
        }
        Insert: {
          cargo_capital_origen_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"] | null
          concepto_id?: string | null
          created_at?: string | null
          fecha_vencimiento?: string | null
          id?: string | null
          inmueble_id?: string | null
          liquidacion_linea_id?: string | null
          monto_original?: number | null
          monto_pendiente?: never
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"] | null
          periodo_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          cargo_capital_origen_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"] | null
          concepto_id?: string | null
          created_at?: string | null
          fecha_vencimiento?: string | null
          id?: string | null
          inmueble_id?: string | null
          liquidacion_linea_id?: string | null
          monto_original?: number | null
          monto_pendiente?: never
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"] | null
          periodo_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_liquidacion_linea_id_fkey"
            columns: ["liquidacion_linea_id"]
            isOneToOne: false
            referencedRelation: "liquidacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_documento_vigente: {
        Row: {
          busqueda_tsv: unknown
          caso_juridico_id: string | null
          created_at: string | null
          descripcion: string | null
          fecha_vencimiento: string | null
          grupo_id: string | null
          id: string | null
          inmueble_id: string | null
          nombre_archivo: string | null
          storage_path: string | null
          subido_por: string | null
          tamano_bytes: number | null
          tenant_id: string | null
          tipo_documento_id: number | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_caso_juridico_id_fkey"
            columns: ["caso_juridico_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tipo_documento_id_fkey"
            columns: ["tipo_documento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inmuebles_sin_titular: {
        Row: {
          area_comun: number | null
          area_privada: number | null
          codigo: string | null
          created_at: string | null
          estado: Database["public"]["Enums"]["inmueble_estado_t"] | null
          estado_legal_id: number | null
          estado_legal_observaciones: string | null
          habitabilidad_id: number | null
          id: string | null
          matricula_inmobiliaria: string | null
          tenant_id: string | null
          tipo_id: number | null
          updated_at: string | null
        }
        Insert: {
          area_comun?: number | null
          area_privada?: number | null
          codigo?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["inmueble_estado_t"] | null
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          habitabilidad_id?: number | null
          id?: string | null
          matricula_inmobiliaria?: string | null
          tenant_id?: string | null
          tipo_id?: number | null
          updated_at?: string | null
        }
        Update: {
          area_comun?: number | null
          area_privada?: number | null
          codigo?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["inmueble_estado_t"] | null
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          habitabilidad_id?: number | null
          id?: string | null
          matricula_inmobiliaria?: string | null
          tenant_id?: string | null
          tipo_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inmuebles_estado_legal_id_fkey"
            columns: ["estado_legal_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_habitabilidad_id_fkey"
            columns: ["habitabilidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_token_hash: string }
        Returns: {
          out_role: Database["public"]["Enums"]["tenant_role_t"]
          out_tenant_id: string
        }[]
      }
      admin_actualizar_perfil_miembro: {
        Args: {
          p_actor_id: string
          p_full_name: string
          p_membership_id: string
          p_phone: string
          p_status: Database["public"]["Enums"]["user_status_t"]
        }
        Returns: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          phone: string | null
          status: Database["public"]["Enums"]["user_status_t"]
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agrupacion_subarbol: {
        Args: { p_agrupacion_id: string }
        Returns: {
          id: string
        }[]
      }
      cartera_etapa_requiere_aprobacion: {
        Args: {
          p_desde: Database["public"]["Enums"]["etapa_cobranza_t"]
          p_hacia: Database["public"]["Enums"]["etapa_cobranza_t"]
        }
        Returns: boolean
      }
      cartera_etapa_transicion_valida: {
        Args: {
          p_desde: Database["public"]["Enums"]["etapa_cobranza_t"]
          p_hacia: Database["public"]["Enums"]["etapa_cobranza_t"]
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_max_hits: number; p_window: string }
        Returns: boolean
      }
      contable_cuadre: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          diferencia: number
          lineas: number
          sin_cuenta: number
          total_credito: number
          total_debito: number
        }[]
      }
      contable_movimientos: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          agrupacion_id: string
          centro_costo_id: number
          credito: number
          cuenta_codigo: string
          cuenta_nombre: string
          debito: number
          descripcion: string
          documento: string
          entidad: string
          fecha: string
          fondo_id: string
          inmueble_id: string
          origen: string
          origen_id: string
          tercero_id: string
        }[]
      }
      contable_parametrizacion_pendiente: {
        Args: { p_tenant_id: string }
        Returns: {
          ambito: string
          detalle: string
          referencia: string
        }[]
      }
      create_tenant: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          canal_notificacion: string | null
          ciudad: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          dia_facturacion: number | null
          direccion: string | null
          email: string | null
          id: string
          logo_path: string | null
          logo_storage_path: string | null
          moneda: string
          name: string
          nit: string | null
          nit_digito_verificacion: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1: string | null
          telefono_2: string | null
          tipo_division_id: number
          updated_at: string | null
          zona_horaria: string
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_tenant_id: { Args: never; Returns: string }
      fn_actividad_reciente_cartera: {
        Args: { p_limite?: number; p_tenant_id: string }
        Returns: {
          codigo: string
          fecha: string
          inmueble_id: string
          monto: number
          tipo: string
        }[]
      }
      fn_alertas_cartera: {
        Args: { p_fecha_referencia: string; p_tenant_id: string }
        Returns: {
          cuotas_acuerdo_vencidas_cantidad: number
          cuotas_acuerdo_vencidas_monto: number
          obligaciones_mayor_90_cantidad: number
          obligaciones_mayor_90_monto: number
          obligaciones_sin_vencimiento_cantidad: number
          obligaciones_sin_vencimiento_monto: number
          promesas_por_vencer_cantidad: number
          promesas_por_vencer_monto: number
        }[]
      }
      fn_anular_liquidacion: {
        Args: { p_liquidacion_id: string; p_motivo: string }
        Returns: Json
      }
      fn_aplicar_descuento_pronto_pago: {
        Args: { p_pago_id: string }
        Returns: number
      }
      fn_aplicar_liquidacion: {
        Args: { p_liquidacion_id: string; p_snapshot_hash?: string }
        Returns: Json
      }
      fn_aprobar_novedad: {
        Args: { p_actor_id: string; p_novedad_id: string }
        Returns: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_buscar_global: {
        Args: {
          p_categoria?: string
          p_limite?: number
          p_query: string
          p_tenant_id: string
        }
        Returns: {
          categoria: string
          entidad_id: string
          inmueble_id: string
          rank: number
          subtitulo: string
          titulo: string
        }[]
      }
      fn_calcular_dv_nit: { Args: { p_nit: string }; Returns: string }
      fn_cerrar_rol_anterior: {
        Args: {
          p_inmueble_id: string
          p_persona_rol_id: string
          p_rol_id: number
          p_tenant_id: string
          p_vigente_desde: string
        }
        Returns: undefined
      }
      fn_cerrar_rol_anterior_tenant: {
        Args: {
          p_rol_id: number
          p_tenant_id: string
          p_tenant_tercero_rol_id: string
          p_vigente_desde: string
        }
        Returns: undefined
      }
      fn_crear_preliquidacion: {
        Args: {
          p_lineas: Json
          p_periodo_id: string
          p_result_hash: string
          p_snapshot?: Json
          p_snapshot_hash?: string
          p_tenant_id: string
          p_tenant_total: number
        }
        Returns: Json
      }
      fn_dashboard_cartera: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          codigo: string
          deuda_corriente: number
          deuda_sin_vencimiento: number
          deuda_total: number
          deuda_vencida: number
          dias_mora_maximo: number
          etapa_cobranza: string
          inmueble_id: string
          interes_causado: number
          saldo_credito: number
        }[]
      }
      fn_emitir_estados_cuenta: {
        Args: { p_liquidacion_id: string }
        Returns: number
      }
      fn_evolucion_cartera_vencida: {
        Args: { p_fecha_hasta: string; p_meses?: number; p_tenant_id: string }
        Returns: {
          deuda_vencida: number
          fecha_snapshot: string
          mes: string
        }[]
      }
      fn_generar_cargos_novedades_periodo: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: number
      }
      fn_guardar_plantilla_email: {
        Args: {
          p_event_type: string
          p_html_content: string
          p_subject: string
          p_tenant_id: string
        }
        Returns: {
          brevo_template_id: number | null
          created_at: string
          event_type: string
          html_content: string
          id: string
          is_synced: boolean
          last_synced_at: string | null
          subject: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "email_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_guardar_plantilla_sms: {
        Args: { p_cuerpo: string; p_event_type: string; p_tenant_id: string }
        Returns: {
          activo: boolean
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "plantillas_sms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_indicadores_gestion: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_tenant_id: string
        }
        Returns: {
          acciones_efectivas: number
          acciones_ejecutadas: number
          acuerdos_cumplidos: number
          acuerdos_terminados: number
          monto_recuperado_periodo: number
          promesas_cumplidas: number
          promesas_vencidas: number
        }[]
      }
      fn_indicadores_legales: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_tenant_id: string
        }
        Returns: {
          cantidad_cargos_saldados: number
          costas_monto: number
          inmuebles_remitidos: number
          inmuebles_tramo_juridico: number
          monto_pretension_casos: number
          monto_recuperado_casos: number
          suma_dias_recuperacion: number
        }[]
      }
      fn_inhabilitar_novedad: {
        Args: { p_actor_id: string; p_novedad_id: string }
        Returns: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_instanciar_plan_contable: {
        Args: {
          p_incluir_opcionales?: boolean
          p_plan_codigo?: string
          p_tenant_id: string
        }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_instanciar_presupuesto_cuenta: {
        Args: { p_tenant_id: string }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_liquidacion_prevuelo: {
        Args: {
          p_liquidacion_id?: string
          p_periodo_id: string
          p_tenant_id: string
        }
        Returns: {
          codigo: string
          detalle: string
          severidad: string
          titulo: string
        }[]
      }
      fn_liquidacion_sello_datos: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: string
      }
      fn_marcar_cuenta_recaudo: {
        Args: { p_cuenta_id: string; p_tenant_id: string }
        Returns: undefined
      }
      fn_marcar_pagador: {
        Args: {
          p_inmueble_id: string
          p_persona_rol_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      fn_panel_acciones_cartera: {
        Args: { p_fecha_referencia: string; p_tenant_id: string }
        Returns: {
          acciones_fallidas: number
          acciones_pendientes_aprobacion: number
          acciones_programadas_hoy: number
          casos_juridicos_sin_actuacion_30d: number
          certificaciones_por_vencer: number
          cuotas_acuerdo_vencen_semana: number
          llamadas_pendientes: number
          promesas_vencen_hoy: number
        }[]
      }
      fn_posicion_cartera: {
        Args: {
          p_fecha_corte: string
          p_inmueble_id?: string
          p_tenant_id: string
        }
        Returns: {
          cantidad_cargos_vencidos: number
          cargo_vencido_mas_antiguo_id: string
          deuda_capital: number
          deuda_interes: number
          deuda_otros: number
          deuda_total: number
          dias_mora_maximo: number
          fecha_vencimiento_mas_antigua: string
          inmueble_id: string
          saldo_credito: number
        }[]
      }
      fn_rechazar_novedad: {
        Args: { p_motivo: string; p_novedad_id: string }
        Returns: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_registrar_fuente_financiacion: {
        Args: {
          p_descripcion?: string
          p_fundamento_normativo_id?: number
          p_presupuesto_cuenta_id?: string
          p_presupuesto_id: string
          p_tipo_id: number
          p_valor_aplicado?: number
          p_valor_disponible: number
        }
        Returns: {
          created_at: string
          descripcion: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_cuenta_id: string | null
          presupuesto_id: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          valor_aplicado: number
          valor_disponible: number
        }
        SetofOptions: {
          from: "*"
          to: "fuente_financiacion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_tipo_division_default: { Args: never; Returns: number }
      fn_toggle_plantilla_sms: {
        Args: { p_activo: boolean; p_event_type: string; p_tenant_id: string }
        Returns: {
          activo: boolean
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "plantillas_sms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_unaccent_immutable: { Args: { p_texto: string }; Returns: string }
      fundamento_validacion_pendiente: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          fundamento_id: number
          norma: string
        }[]
      }
      has_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["tenant_role_t"][]
          p_tenant: string
        }
        Returns: boolean
      }
      invite_user: {
        Args: {
          p_email: string
          p_expires_at: string
          p_role: Database["public"]["Enums"]["tenant_role_t"]
          p_tenant_id: string
          p_token_hash: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_member: { Args: { p_tenant: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      presupuesto_cuenta_ejecucion: {
        Args: { p_presupuesto_id: string }
        Returns: {
          cuenta_id: string
          ejecutado: number
          presupuestado: number
        }[]
      }
      presupuesto_cuenta_totales: {
        Args: { p_presupuesto_id: string }
        Returns: {
          cuenta_id: string
          monto_acumulado: number
        }[]
      }
      puede_ver_modulo: {
        Args: { p_modulo: string; p_tenant: string }
        Returns: boolean
      }
      purge_audit_log_antiguo: { Args: never; Returns: undefined }
      purge_rate_limit_hits_antiguo: { Args: never; Returns: undefined }
      resend_invitation: {
        Args: {
          p_expires_at: string
          p_invitation_id: string
          p_token_hash: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      shares_tenant_with: { Args: { p_user: string }; Returns: boolean }
      switch_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      tiene_rol_funcional: {
        Args: { p_modulo: string; p_tenant: string }
        Returns: boolean
      }
      validar_cuenta_contable_destino: {
        Args: {
          p_cuenta_id: string
          p_prefijo_codigo?: string
          p_tenant_id: string
        }
        Returns: {
          activa: boolean
          clase: number
          codigo: string
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel: number
          nombre: string
          parent_id: string | null
          permite_movimiento: boolean
          plan_cuenta_id: string | null
          requiere_centro_costo: boolean
          requiere_fondo: boolean
          requiere_inmueble: boolean
          requiere_tercero: boolean
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "contable_cuenta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      alcance_accion_cobranza_t: "inmueble" | "cargo"
      canal_cobranza_t:
        | "email"
        | "sms"
        | "whatsapp"
        | "telefono"
        | "fisico"
        | "interno"
      cargo_categoria_t: "capital" | "interes" | "otro"
      cargo_origen_t: "liquidacion_linea" | "novedad" | "interes" | "descuento"
      concepto_alcance_t: "todos" | "calculado"
      concepto_estado_t: "borrador" | "en_revision" | "activo" | "archivado"
      concepto_modo_calculo_t: "directo" | "distribucion"
      concepto_modo_valor_t: "fijo" | "formulado"
      concepto_periodicidad_t:
        | "mensual"
        | "bimensual"
        | "trimestral"
        | "semestral"
        | "anual"
      concepto_tipo_recurrencia_t:
        | "recurrente"
        | "unico"
        | "por_periodo"
        | "novedad"
      contable_naturaleza_t: "debito" | "credito"
      cuenta_bancaria_tipo_t: "ahorros" | "corriente" | "billetera"
      descuento_pronto_pago_modo_t: "reduce_deuda" | "saldo_a_favor"
      ejecucion_liquidacion_t: "pagado_banco" | "pagado_caja" | "por_pagar"
      estado_accion_cobranza_t:
        | "programada"
        | "pendiente_aprobacion"
        | "aprobada"
        | "rechazada"
        | "ejecutando"
        | "ejecutada"
        | "fallida"
        | "cancelada"
      estado_acuerdo_t:
        | "borrador"
        | "pendiente_aprobacion"
        | "vigente"
        | "cumplido"
        | "incumplido"
        | "cancelado"
      estado_caso_juridico_t:
        | "remitido"
        | "documentacion"
        | "radicado"
        | "admitido"
        | "en_tramite"
        | "medidas_cautelares"
        | "conciliacion"
        | "sentencia"
        | "ejecucion"
        | "terminado"
        | "desistido"
        | "archivado"
      estado_certificacion_t: "vigente" | "anulada"
      estado_costa_t:
        | "liquidada"
        | "impugnada"
        | "en_firme"
        | "recuperada"
        | "no_recuperable"
      estado_cuota_acuerdo_t:
        | "pendiente"
        | "parcial"
        | "pagada"
        | "vencida"
        | "incumplida"
        | "cancelada"
      estado_promesa_t: "pendiente" | "cumplida" | "incumplida" | "cancelada"
      etapa_cobranza_t:
        | "preventiva"
        | "administrativa"
        | "prejuridica"
        | "juridica"
        | "judicial"
      fondo_base_calculo_t: "presupuesto_anual" | "cuota_administracion"
      fondo_movimiento_tipo_t: "aporte" | "uso"
      fondo_tipo_t: "imprevistos" | "otro"
      fundamento_tipo_t:
        | "ley"
        | "decreto"
        | "reglamento_ph"
        | "decision_asamblea"
        | "otra"
        | "orientacion_tecnica"
      inmueble_estado_t: "activo" | "inactivo"
      interes_day_count_t:
        | "mensual_30_dias_reales"
        | "actual_365"
        | "actual_360"
        | "treinta_360"
      interes_descuento_orden_t:
        | "interes_sobre_capital_completo"
        | "descuento_antes_interes"
      invite_status_t: "pending" | "accepted" | "revoked" | "expired"
      liquidacion_estado_t:
        | "pre_liquidada"
        | "pendiente_aprobacion"
        | "rechazada"
        | "aplicada"
        | "descartada"
        | "anulada"
        | "fallida"
      member_status_t: "active" | "revoked"
      nivel_riesgo_t: "ninguno" | "bajo" | "medio" | "alto" | "critico"
      novedad_estado_t: "pendiente" | "aprobada" | "rechazada"
      novedad_tipo_t:
        | "CHARGE"
        | "DISCOUNT"
        | "ADJUSTMENT"
        | "REFUND"
        | "CREDIT"
        | "DEBIT"
      origen_accion_cobranza_t: "job" | "manual"
      origen_evento_t: "job" | "usuario" | "sistema" | "integracion"
      periodo_estado_t: "abierto" | "en_liquidacion" | "cerrado" | "bloqueado"
      politica_imputacion_estrategia_t: "deuda_mas_antigua" | "periodo_actual"
      presupuesto_cuenta_naturaleza_t: "ingreso" | "egreso"
      presupuesto_estado_t: "borrador" | "aprobado" | "vigente" | "cerrado"
      presupuesto_reconocimiento_ingreso_t: "causacion" | "caja"
      redondeo_modo_t: "half_up" | "half_even" | "down" | "up"
      residual_metodo_t: "mayor_resto"
      resultado_accion_cobranza_t:
        | "sin_respuesta"
        | "contacto_efectivo"
        | "contacto_no_efectivo"
        | "promesa_de_pago"
        | "acuerdo_solicitado"
        | "pago_recibido"
        | "rechazo_deudor"
        | "datos_incorrectos"
        | "no_aplica"
      tenant_role_t: "auxiliar" | "auditor" | "administrador"
      tenant_status_t: "active" | "suspended" | "deleted"
      tercero_tipo_t: "natural" | "juridica"
      tipo_accion_cobranza_t:
        | "email"
        | "sms"
        | "whatsapp"
        | "llamada"
        | "carta"
        | "requerimiento_formal"
        | "aviso_prejuridico"
        | "publicacion_morosos"
        | "restriccion_servicios"
        | "visita"
        | "asignacion_abogado"
        | "remision_juridica"
        | "propuesta_acuerdo"
        | "revision_manual"
      tipo_costa_t:
        | "gasto_proceso"
        | "agencias_en_derecho"
        | "honorario_auxiliar"
        | "otro_costo_aprobado"
      tipo_evento_cartera_t:
        | "CARGO_VENCIDO"
        | "CARGO_SALDADO"
        | "CARTERA_CLASIFICACION_CAMBIO"
        | "CARTERA_ETAPA_CAMBIO"
        | "CARTERA_POSICION_CONGELADA"
        | "COBRANZA_ACCION_PROGRAMADA"
        | "COBRANZA_ACCION_APROBADA"
        | "COBRANZA_ACCION_RECHAZADA"
        | "COBRANZA_ACCION_EJECUTADA"
        | "COBRANZA_ACCION_FALLIDA"
        | "COBRANZA_ACCION_OMITIDA"
        | "COBRANZA_ACCION_CANCELADA"
        | "COBRANZA_RESULTADO_REGISTRADO"
        | "PROMESA_REGISTRADA"
        | "PROMESA_CUMPLIDA"
        | "PROMESA_INCUMPLIDA"
        | "ACUERDO_CREADO"
        | "ACUERDO_APROBADO"
        | "ACUERDO_CUOTA_VENCIDA"
        | "ACUERDO_CUOTA_PAGADA"
        | "ACUERDO_CUMPLIDO"
        | "ACUERDO_INCUMPLIDO"
        | "CERTIFICACION_DEUDA_EXPEDIDA"
        | "CERTIFICACION_DEUDA_ANULADA"
        | "CASO_JURIDICO_CREADO"
        | "CASO_JURIDICO_ACTUACION"
        | "CASO_JURIDICO_ESTADO_CAMBIO"
        | "CASO_JURIDICO_CERRADO"
        | "COSTA_JUDICIAL_REGISTRADA"
        | "PAGO_REGISTRADO"
        | "PAGO_IMPUTADO"
        | "INTERES_CALCULADO"
        | "NOVEDAD_APROBADA"
        | "LIQUIDACION_COMPLETADA"
      tipo_tasa_referencia_t: "ibc_consumo_ordinario"
      user_status_t: "active" | "suspended"
      vigencia_estado_t: "borrador" | "vigente" | "historica"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alcance_accion_cobranza_t: ["inmueble", "cargo"],
      canal_cobranza_t: [
        "email",
        "sms",
        "whatsapp",
        "telefono",
        "fisico",
        "interno",
      ],
      cargo_categoria_t: ["capital", "interes", "otro"],
      cargo_origen_t: ["liquidacion_linea", "novedad", "interes", "descuento"],
      concepto_alcance_t: ["todos", "calculado"],
      concepto_estado_t: ["borrador", "en_revision", "activo", "archivado"],
      concepto_modo_calculo_t: ["directo", "distribucion"],
      concepto_modo_valor_t: ["fijo", "formulado"],
      concepto_periodicidad_t: [
        "mensual",
        "bimensual",
        "trimestral",
        "semestral",
        "anual",
      ],
      concepto_tipo_recurrencia_t: [
        "recurrente",
        "unico",
        "por_periodo",
        "novedad",
      ],
      contable_naturaleza_t: ["debito", "credito"],
      cuenta_bancaria_tipo_t: ["ahorros", "corriente", "billetera"],
      descuento_pronto_pago_modo_t: ["reduce_deuda", "saldo_a_favor"],
      ejecucion_liquidacion_t: ["pagado_banco", "pagado_caja", "por_pagar"],
      estado_accion_cobranza_t: [
        "programada",
        "pendiente_aprobacion",
        "aprobada",
        "rechazada",
        "ejecutando",
        "ejecutada",
        "fallida",
        "cancelada",
      ],
      estado_acuerdo_t: [
        "borrador",
        "pendiente_aprobacion",
        "vigente",
        "cumplido",
        "incumplido",
        "cancelado",
      ],
      estado_caso_juridico_t: [
        "remitido",
        "documentacion",
        "radicado",
        "admitido",
        "en_tramite",
        "medidas_cautelares",
        "conciliacion",
        "sentencia",
        "ejecucion",
        "terminado",
        "desistido",
        "archivado",
      ],
      estado_certificacion_t: ["vigente", "anulada"],
      estado_costa_t: [
        "liquidada",
        "impugnada",
        "en_firme",
        "recuperada",
        "no_recuperable",
      ],
      estado_cuota_acuerdo_t: [
        "pendiente",
        "parcial",
        "pagada",
        "vencida",
        "incumplida",
        "cancelada",
      ],
      estado_promesa_t: ["pendiente", "cumplida", "incumplida", "cancelada"],
      etapa_cobranza_t: [
        "preventiva",
        "administrativa",
        "prejuridica",
        "juridica",
        "judicial",
      ],
      fondo_base_calculo_t: ["presupuesto_anual", "cuota_administracion"],
      fondo_movimiento_tipo_t: ["aporte", "uso"],
      fondo_tipo_t: ["imprevistos", "otro"],
      fundamento_tipo_t: [
        "ley",
        "decreto",
        "reglamento_ph",
        "decision_asamblea",
        "otra",
        "orientacion_tecnica",
      ],
      inmueble_estado_t: ["activo", "inactivo"],
      interes_day_count_t: [
        "mensual_30_dias_reales",
        "actual_365",
        "actual_360",
        "treinta_360",
      ],
      interes_descuento_orden_t: [
        "interes_sobre_capital_completo",
        "descuento_antes_interes",
      ],
      invite_status_t: ["pending", "accepted", "revoked", "expired"],
      liquidacion_estado_t: [
        "pre_liquidada",
        "pendiente_aprobacion",
        "rechazada",
        "aplicada",
        "descartada",
        "anulada",
        "fallida",
      ],
      member_status_t: ["active", "revoked"],
      nivel_riesgo_t: ["ninguno", "bajo", "medio", "alto", "critico"],
      novedad_estado_t: ["pendiente", "aprobada", "rechazada"],
      novedad_tipo_t: [
        "CHARGE",
        "DISCOUNT",
        "ADJUSTMENT",
        "REFUND",
        "CREDIT",
        "DEBIT",
      ],
      origen_accion_cobranza_t: ["job", "manual"],
      origen_evento_t: ["job", "usuario", "sistema", "integracion"],
      periodo_estado_t: ["abierto", "en_liquidacion", "cerrado", "bloqueado"],
      politica_imputacion_estrategia_t: ["deuda_mas_antigua", "periodo_actual"],
      presupuesto_cuenta_naturaleza_t: ["ingreso", "egreso"],
      presupuesto_estado_t: ["borrador", "aprobado", "vigente", "cerrado"],
      presupuesto_reconocimiento_ingreso_t: ["causacion", "caja"],
      redondeo_modo_t: ["half_up", "half_even", "down", "up"],
      residual_metodo_t: ["mayor_resto"],
      resultado_accion_cobranza_t: [
        "sin_respuesta",
        "contacto_efectivo",
        "contacto_no_efectivo",
        "promesa_de_pago",
        "acuerdo_solicitado",
        "pago_recibido",
        "rechazo_deudor",
        "datos_incorrectos",
        "no_aplica",
      ],
      tenant_role_t: ["auxiliar", "auditor", "administrador"],
      tenant_status_t: ["active", "suspended", "deleted"],
      tercero_tipo_t: ["natural", "juridica"],
      tipo_accion_cobranza_t: [
        "email",
        "sms",
        "whatsapp",
        "llamada",
        "carta",
        "requerimiento_formal",
        "aviso_prejuridico",
        "publicacion_morosos",
        "restriccion_servicios",
        "visita",
        "asignacion_abogado",
        "remision_juridica",
        "propuesta_acuerdo",
        "revision_manual",
      ],
      tipo_costa_t: [
        "gasto_proceso",
        "agencias_en_derecho",
        "honorario_auxiliar",
        "otro_costo_aprobado",
      ],
      tipo_evento_cartera_t: [
        "CARGO_VENCIDO",
        "CARGO_SALDADO",
        "CARTERA_CLASIFICACION_CAMBIO",
        "CARTERA_ETAPA_CAMBIO",
        "CARTERA_POSICION_CONGELADA",
        "COBRANZA_ACCION_PROGRAMADA",
        "COBRANZA_ACCION_APROBADA",
        "COBRANZA_ACCION_RECHAZADA",
        "COBRANZA_ACCION_EJECUTADA",
        "COBRANZA_ACCION_FALLIDA",
        "COBRANZA_ACCION_OMITIDA",
        "COBRANZA_ACCION_CANCELADA",
        "COBRANZA_RESULTADO_REGISTRADO",
        "PROMESA_REGISTRADA",
        "PROMESA_CUMPLIDA",
        "PROMESA_INCUMPLIDA",
        "ACUERDO_CREADO",
        "ACUERDO_APROBADO",
        "ACUERDO_CUOTA_VENCIDA",
        "ACUERDO_CUOTA_PAGADA",
        "ACUERDO_CUMPLIDO",
        "ACUERDO_INCUMPLIDO",
        "CERTIFICACION_DEUDA_EXPEDIDA",
        "CERTIFICACION_DEUDA_ANULADA",
        "CASO_JURIDICO_CREADO",
        "CASO_JURIDICO_ACTUACION",
        "CASO_JURIDICO_ESTADO_CAMBIO",
        "CASO_JURIDICO_CERRADO",
        "COSTA_JUDICIAL_REGISTRADA",
        "PAGO_REGISTRADO",
        "PAGO_IMPUTADO",
        "INTERES_CALCULADO",
        "NOVEDAD_APROBADA",
        "LIQUIDACION_COMPLETADA",
      ],
      tipo_tasa_referencia_t: ["ibc_consumo_ordinario"],
      user_status_t: ["active", "suspended"],
      vigencia_estado_t: ["borrador", "vigente", "historica"],
    },
  },
} as const
