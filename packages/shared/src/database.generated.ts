/**
 * GENERADO — no editar a mano (Fase I §3.3, DB-first).
 * Regenerar con: pnpm db:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15'
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
            foreignKeyName: 'audit_log_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_log_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_log_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      coeficiente_sets: {
        Row: {
          created_at: string
          estado: Database['public']['Enums']['vigencia_estado_t']
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
          estado?: Database['public']['Enums']['vigencia_estado_t']
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
          estado?: Database['public']['Enums']['vigencia_estado_t']
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
            foreignKeyName: 'coeficiente_sets_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coeficiente_sets_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
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
            foreignKeyName: 'coeficientes_inmueble_id_fkey'
            columns: ['inmueble_id']
            isOneToOne: false
            referencedRelation: 'inmuebles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coeficientes_set_id_fkey'
            columns: ['set_id']
            isOneToOne: false
            referencedRelation: 'coeficiente_sets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coeficientes_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coeficientes_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      conceptos: {
        Row: {
          codigo: string
          created_at: string
          estado: Database['public']['Enums']['concepto_estado_t']
          formula_ael: string | null
          id: string
          modo_calculo: Database['public']['Enums']['concepto_modo_calculo_t']
          nombre: string
          prioridad: number
          tenant_id: string
          tipo_base: Database['public']['Enums']['concepto_tipo_base_t']
          updated_at: string | null
          version: number
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: Database['public']['Enums']['concepto_estado_t']
          formula_ael?: string | null
          id?: string
          modo_calculo: Database['public']['Enums']['concepto_modo_calculo_t']
          nombre: string
          prioridad?: number
          tenant_id: string
          tipo_base: Database['public']['Enums']['concepto_tipo_base_t']
          updated_at?: string | null
          version?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: Database['public']['Enums']['concepto_estado_t']
          formula_ael?: string | null
          id?: string
          modo_calculo?: Database['public']['Enums']['concepto_modo_calculo_t']
          nombre?: string
          prioridad?: number
          tenant_id?: string
          tipo_base?: Database['public']['Enums']['concepto_tipo_base_t']
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'conceptos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conceptos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
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
          tipo: Database['public']['Enums']['fondo_movimiento_tipo_t']
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
          tipo: Database['public']['Enums']['fondo_movimiento_tipo_t']
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
          tipo?: Database['public']['Enums']['fondo_movimiento_tipo_t']
        }
        Relationships: [
          {
            foreignKeyName: 'fondo_movimientos_autorizado_por_fkey'
            columns: ['autorizado_por']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fondo_movimientos_fondo_id_fkey'
            columns: ['fondo_id']
            isOneToOne: false
            referencedRelation: 'fondos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fondo_movimientos_liquidacion_id_fkey'
            columns: ['liquidacion_id']
            isOneToOne: false
            referencedRelation: 'liquidaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fondo_movimientos_periodo_id_fkey'
            columns: ['periodo_id']
            isOneToOne: false
            referencedRelation: 'periodos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fondo_movimientos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fondo_movimientos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      fondos: {
        Row: {
          created_at: string
          id: string
          nombre: string
          saldo_actual: number
          tenant_id: string
          tipo: Database['public']['Enums']['fondo_tipo_t']
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          saldo_actual?: number
          tenant_id: string
          tipo: Database['public']['Enums']['fondo_tipo_t']
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          saldo_actual?: number
          tenant_id?: string
          tipo?: Database['public']['Enums']['fondo_tipo_t']
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'fondos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fondos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      fuente_financiacion: {
        Row: {
          created_at: string
          descripcion: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_id: string
          tenant_id: string
          tipo: Database['public']['Enums']['fuente_financiacion_tipo_t']
          updated_at: string | null
          valor_aplicado: number
          valor_disponible: number
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_id: string
          tenant_id: string
          tipo: Database['public']['Enums']['fuente_financiacion_tipo_t']
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible: number
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_id?: string
          tenant_id?: string
          tipo?: Database['public']['Enums']['fuente_financiacion_tipo_t']
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible?: number
        }
        Relationships: [
          {
            foreignKeyName: 'fuente_financiacion_fundamento_normativo_id_fkey'
            columns: ['fundamento_normativo_id']
            isOneToOne: false
            referencedRelation: 'fundamento_normativo'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fuente_financiacion_presupuesto_id_fkey'
            columns: ['presupuesto_id']
            isOneToOne: false
            referencedRelation: 'presupuestos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fuente_financiacion_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fuente_financiacion_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      fundamento_normativo: {
        Row: {
          articulo: string | null
          created_at: string
          descripcion: string | null
          fecha_vigencia: string | null
          id: number
          norma: string
          referencia: string | null
          tenant_id: string | null
          tipo: Database['public']['Enums']['fundamento_tipo_t']
          updated_at: string | null
        }
        Insert: {
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_vigencia?: string | null
          id?: never
          norma: string
          referencia?: string | null
          tenant_id?: string | null
          tipo: Database['public']['Enums']['fundamento_tipo_t']
          updated_at?: string | null
        }
        Update: {
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_vigencia?: string | null
          id?: never
          norma?: string
          referencia?: string | null
          tenant_id?: string | null
          tipo?: Database['public']['Enums']['fundamento_tipo_t']
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'fundamento_normativo_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fundamento_normativo_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      inmueble_propietario: {
        Row: {
          created_at: string
          desde: string
          hasta: string | null
          id: string
          inmueble_id: string
          porcentaje: number
          propietario_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          desde: string
          hasta?: string | null
          id?: string
          inmueble_id: string
          porcentaje: number
          propietario_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          desde?: string
          hasta?: string | null
          id?: string
          inmueble_id?: string
          porcentaje?: number
          propietario_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'inmueble_propietario_inmueble_id_fkey'
            columns: ['inmueble_id']
            isOneToOne: false
            referencedRelation: 'inmuebles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inmueble_propietario_propietario_id_fkey'
            columns: ['propietario_id']
            isOneToOne: false
            referencedRelation: 'propietarios'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inmueble_propietario_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inmueble_propietario_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      inmuebles: {
        Row: {
          area_comun: number | null
          area_privada: number | null
          codigo: string
          created_at: string
          estado: Database['public']['Enums']['inmueble_estado_t']
          id: string
          matricula_inmobiliaria: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          area_comun?: number | null
          area_privada?: number | null
          codigo: string
          created_at?: string
          estado?: Database['public']['Enums']['inmueble_estado_t']
          id?: string
          matricula_inmobiliaria?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          area_comun?: number | null
          area_privada?: number | null
          codigo?: string
          created_at?: string
          estado?: Database['public']['Enums']['inmueble_estado_t']
          id?: string
          matricula_inmobiliaria?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'inmuebles_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inmuebles_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inmuebles_tipo_id_fkey'
            columns: ['tipo_id']
            isOneToOne: false
            referencedRelation: 'lista_tipos'
            referencedColumns: ['id']
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
          role: Database['public']['Enums']['tenant_role_t']
          status: Database['public']['Enums']['invite_status_t']
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
          role: Database['public']['Enums']['tenant_role_t']
          status?: Database['public']['Enums']['invite_status_t']
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
          role?: Database['public']['Enums']['tenant_role_t']
          status?: Database['public']['Enums']['invite_status_t']
          tenant_id?: string
          token_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invitations_accepted_by_fkey'
            columns: ['accepted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitations_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitations_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitations_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
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
            foreignKeyName: 'liquidacion_lineas_concepto_id_fkey'
            columns: ['concepto_id']
            isOneToOne: false
            referencedRelation: 'conceptos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'liquidacion_lineas_inmueble_id_fkey'
            columns: ['inmueble_id']
            isOneToOne: false
            referencedRelation: 'inmuebles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'liquidacion_lineas_liquidacion_id_fkey'
            columns: ['liquidacion_id']
            isOneToOne: false
            referencedRelation: 'liquidaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'liquidacion_lineas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'liquidacion_lineas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      liquidaciones: {
        Row: {
          created_at: string
          estado: Database['public']['Enums']['liquidacion_estado_t']
          id: string
          periodo_id: string
          result_hash: string
          tenant_id: string
          tenant_total: number
        }
        Insert: {
          created_at?: string
          estado?: Database['public']['Enums']['liquidacion_estado_t']
          id?: string
          periodo_id: string
          result_hash: string
          tenant_id: string
          tenant_total: number
        }
        Update: {
          created_at?: string
          estado?: Database['public']['Enums']['liquidacion_estado_t']
          id?: string
          periodo_id?: string
          result_hash?: string
          tenant_id?: string
          tenant_total?: number
        }
        Relationships: [
          {
            foreignKeyName: 'liquidaciones_periodo_id_fkey'
            columns: ['periodo_id']
            isOneToOne: false
            referencedRelation: 'periodos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'liquidaciones_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'liquidaciones_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
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
            foreignKeyName: 'lista_tipos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lista_tipos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lista_tipos_tipo_fkey'
            columns: ['tipo']
            isOneToOne: false
            referencedRelation: 'tipos'
            referencedColumns: ['codigo']
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database['public']['Enums']['tenant_role_t']
          status: Database['public']['Enums']['member_status_t']
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database['public']['Enums']['tenant_role_t']
          status?: Database['public']['Enums']['member_status_t']
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database['public']['Enums']['tenant_role_t']
          status?: Database['public']['Enums']['member_status_t']
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      periodos: {
        Row: {
          anio: number
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string
          estado: Database['public']['Enums']['periodo_estado_t']
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
          estado?: Database['public']['Enums']['periodo_estado_t']
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
          estado?: Database['public']['Enums']['periodo_estado_t']
          fecha_vencimiento?: string | null
          id?: string
          mes?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'periodos_cerrado_por_fkey'
            columns: ['cerrado_por']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'periodos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'periodos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      politicas_financieras: {
        Row: {
          coeficientes_suma_esperada: number
          created_at: string
          estado: Database['public']['Enums']['vigencia_estado_t']
          fondo_imprevistos_base: Database['public']['Enums']['fondo_base_calculo_t'] | null
          fondo_imprevistos_porcentaje: number | null
          id: string
          imputacion_orden: Json
          interes_dias_gracia: number
          interes_tasa_mensual: number | null
          interes_tope_mensual: number | null
          policy_hash: string
          redondeo_escala: number
          redondeo_modo: Database['public']['Enums']['redondeo_modo_t']
          residual_metodo: Database['public']['Enums']['residual_metodo_t']
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          coeficientes_suma_esperada?: number
          created_at?: string
          estado?: Database['public']['Enums']['vigencia_estado_t']
          fondo_imprevistos_base?: Database['public']['Enums']['fondo_base_calculo_t'] | null
          fondo_imprevistos_porcentaje?: number | null
          id?: string
          imputacion_orden?: Json
          interes_dias_gracia?: number
          interes_tasa_mensual?: number | null
          interes_tope_mensual?: number | null
          policy_hash: string
          redondeo_escala?: number
          redondeo_modo?: Database['public']['Enums']['redondeo_modo_t']
          residual_metodo?: Database['public']['Enums']['residual_metodo_t']
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          coeficientes_suma_esperada?: number
          created_at?: string
          estado?: Database['public']['Enums']['vigencia_estado_t']
          fondo_imprevistos_base?: Database['public']['Enums']['fondo_base_calculo_t'] | null
          fondo_imprevistos_porcentaje?: number | null
          id?: string
          imputacion_orden?: Json
          interes_dias_gracia?: number
          interes_tasa_mensual?: number | null
          interes_tope_mensual?: number | null
          policy_hash?: string
          redondeo_escala?: number
          redondeo_modo?: Database['public']['Enums']['redondeo_modo_t']
          residual_metodo?: Database['public']['Enums']['residual_metodo_t']
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'politicas_financieras_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'politicas_financieras_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      presupuesto_rubros: {
        Row: {
          categoria_id: number
          codigo: string
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          categoria_id: number
          codigo: string
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          categoria_id?: number
          codigo?: string
          created_at?: string
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
            foreignKeyName: 'presupuesto_rubros_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'lista_tipos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'presupuesto_rubros_fundamento_normativo_id_fkey'
            columns: ['fundamento_normativo_id']
            isOneToOne: false
            referencedRelation: 'fundamento_normativo'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'presupuesto_rubros_presupuesto_id_fkey'
            columns: ['presupuesto_id']
            isOneToOne: false
            referencedRelation: 'presupuestos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'presupuesto_rubros_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'presupuesto_rubros_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      presupuestos: {
        Row: {
          acta_asamblea: string | null
          anio: number
          created_at: string
          estado: Database['public']['Enums']['presupuesto_estado_t']
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
          estado?: Database['public']['Enums']['presupuesto_estado_t']
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
          estado?: Database['public']['Enums']['presupuesto_estado_t']
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
            foreignKeyName: 'presupuestos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'presupuestos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
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
          status: Database['public']['Enums']['user_status_t']
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
          status?: Database['public']['Enums']['user_status_t']
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
          status?: Database['public']['Enums']['user_status_t']
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_active_tenant_id_fkey'
            columns: ['active_tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'profiles_active_tenant_id_fkey'
            columns: ['active_tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      propietarios: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          numero_documento: string
          telefono: string | null
          tenant_id: string
          tipo_documento: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          numero_documento: string
          telefono?: string | null
          tenant_id: string
          tipo_documento: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          numero_documento?: string
          telefono?: string | null
          tenant_id?: string
          tipo_documento?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'propietarios_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'propietarios_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
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
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          direccion: string | null
          id: string
          moneda: string
          name: string
          nit: string | null
          settings: Json
          slug: string
          status: Database['public']['Enums']['tenant_status_t']
          updated_at: string | null
          zona_horaria: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          id?: string
          moneda?: string
          name: string
          nit?: string | null
          settings?: Json
          slug: string
          status?: Database['public']['Enums']['tenant_status_t']
          updated_at?: string | null
          zona_horaria?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          id?: string
          moneda?: string
          name?: string
          nit?: string | null
          settings?: Json
          slug?: string
          status?: Database['public']['Enums']['tenant_status_t']
          updated_at?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tenants_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
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
          area: number | null
          codigo: string
          created_at: string
          id: string
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          uso_exclusivo_inmueble_id: string | null
        }
        Insert: {
          area?: number | null
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Update: {
          area?: number | null
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'zonas_comunes_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'platform_tenant_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zonas_comunes_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zonas_comunes_tipo_id_fkey'
            columns: ['tipo_id']
            isOneToOne: false
            referencedRelation: 'lista_tipos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zonas_comunes_uso_exclusivo_inmueble_id_fkey'
            columns: ['uso_exclusivo_inmueble_id']
            isOneToOne: false
            referencedRelation: 'inmuebles'
            referencedColumns: ['id']
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
          status: Database['public']['Enums']['tenant_status_t'] | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          member_count?: never
          name?: string | null
          slug?: string | null
          status?: Database['public']['Enums']['tenant_status_t'] | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          member_count?: never
          name?: string | null
          slug?: string | null
          status?: Database['public']['Enums']['tenant_status_t'] | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_token_hash: string }
        Returns: {
          out_role: Database['public']['Enums']['tenant_role_t']
          out_tenant_id: string
        }[]
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_max_hits: number; p_window: string }
        Returns: boolean
      }
      create_tenant: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          created_at: string
          created_by: string | null
          direccion: string | null
          id: string
          moneda: string
          name: string
          nit: string | null
          settings: Json
          slug: string
          status: Database['public']['Enums']['tenant_status_t']
          updated_at: string | null
          zona_horaria: string
        }
        SetofOptions: {
          from: '*'
          to: 'tenants'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          p_roles: Database['public']['Enums']['tenant_role_t'][]
          p_tenant: string
        }
        Returns: boolean
      }
      invite_user: {
        Args: {
          p_email: string
          p_expires_at: string
          p_role: Database['public']['Enums']['tenant_role_t']
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
          role: Database['public']['Enums']['tenant_role_t']
          status: Database['public']['Enums']['invite_status_t']
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'invitations'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_member: { Args: { p_tenant: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      purge_audit_log_antiguo: { Args: never; Returns: undefined }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      shares_tenant_with: { Args: { p_user: string }; Returns: boolean }
      switch_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
    }
    Enums: {
      concepto_estado_t: 'borrador' | 'activo' | 'archivado'
      concepto_modo_calculo_t: 'directo' | 'distribucion'
      concepto_tipo_base_t: 'fijo' | 'coeficiente' | 'cantidad' | 'porcentaje' | 'saldo'
      fondo_base_calculo_t: 'presupuesto_anual' | 'cuota_administracion'
      fondo_movimiento_tipo_t: 'aporte' | 'uso'
      fondo_tipo_t: 'imprevistos' | 'otro'
      fuente_financiacion_tipo_t:
        'otros_ingresos' | 'cuota_extraordinaria' | 'fondo_imprevistos' | 'saldo_aplicable'
      fundamento_tipo_t: 'ley' | 'decreto' | 'reglamento_ph' | 'decision_asamblea' | 'otra'
      inmueble_estado_t: 'activo' | 'inactivo'
      invite_status_t: 'pending' | 'accepted' | 'revoked' | 'expired'
      liquidacion_estado_t: 'completada' | 'fallida'
      member_status_t: 'active' | 'revoked'
      periodo_estado_t: 'abierto' | 'en_liquidacion' | 'cerrado' | 'bloqueado'
      presupuesto_estado_t: 'borrador' | 'aprobado' | 'vigente' | 'cerrado'
      redondeo_modo_t: 'half_up' | 'half_even' | 'down' | 'up'
      residual_metodo_t: 'mayor_resto'
      tenant_role_t: 'agent' | 'auditor'
      tenant_status_t: 'active' | 'suspended' | 'deleted'
      user_status_t: 'active' | 'suspended'
      vigencia_estado_t: 'borrador' | 'vigente' | 'historica'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      concepto_estado_t: ['borrador', 'activo', 'archivado'],
      concepto_modo_calculo_t: ['directo', 'distribucion'],
      concepto_tipo_base_t: ['fijo', 'coeficiente', 'cantidad', 'porcentaje', 'saldo'],
      fondo_base_calculo_t: ['presupuesto_anual', 'cuota_administracion'],
      fondo_movimiento_tipo_t: ['aporte', 'uso'],
      fondo_tipo_t: ['imprevistos', 'otro'],
      fuente_financiacion_tipo_t: [
        'otros_ingresos',
        'cuota_extraordinaria',
        'fondo_imprevistos',
        'saldo_aplicable',
      ],
      fundamento_tipo_t: ['ley', 'decreto', 'reglamento_ph', 'decision_asamblea', 'otra'],
      inmueble_estado_t: ['activo', 'inactivo'],
      invite_status_t: ['pending', 'accepted', 'revoked', 'expired'],
      liquidacion_estado_t: ['completada', 'fallida'],
      member_status_t: ['active', 'revoked'],
      periodo_estado_t: ['abierto', 'en_liquidacion', 'cerrado', 'bloqueado'],
      presupuesto_estado_t: ['borrador', 'aprobado', 'vigente', 'cerrado'],
      redondeo_modo_t: ['half_up', 'half_even', 'down', 'up'],
      residual_metodo_t: ['mayor_resto'],
      tenant_role_t: ['agent', 'auditor'],
      tenant_status_t: ['active', 'suspended', 'deleted'],
      user_status_t: ['active', 'suspended'],
      vigencia_estado_t: ['borrador', 'vigente', 'historica'],
    },
  },
} as const
