"""Tipos de Órdenes de Trabajo y validación de transiciones de estado."""

TIPOS_OT = {
    'reparacion': {
        'label': 'Reparación',
        'icono': '🔧',
        'color': '#f97316',
        'estados': ['recibido', 'diagnosticando', 'presupuestado', 'aprobado', 'reparando', 'esperando_repuestos', 'completado', 'entregado', 'cancelado'],
        'campos': ['falla_reportada', 'diagnostico'],
        'transiciones': {
            'recibido': ['diagnosticando', 'cancelado'],
            'diagnosticando': ['presupuestado', 'cancelado'],
            'presupuestado': ['aprobado', 'cancelado'],
            'aprobado': ['reparando', 'cancelado'],
            'reparando': ['esperando_repuestos', 'completado', 'cancelado'],
            'esperando_repuestos': ['reparando', 'cancelado'],
            'completado': ['entregado'],
            'entregado': [],
            'cancelado': [],
        },
        'precondiciones': {
            'presupuestado': ['diagnostico'],
            'aprobado': ['presupuesto'],
            'completado': ['diagnostico'],
        },
    },
    'fabricacion': {
        'label': 'Fabricación',
        'icono': '🏭',
        'color': '#0ea5e9',
        'estados': ['cotizando', 'diseno_aprobado', 'materiales', 'bobinado', 'ensamble', 'pruebas', 'control_calidad', 'finalizado', 'entregado', 'cancelado'],
        'campos': ['tipo_producto', 'capacidad', 'voltaje_entrada', 'voltaje_salida', 'fases', 'nucleo', 'refrigeracion', 'operario', 'fecha_inicio', 'fecha_estimada'],
        'transiciones': {
            'cotizando': ['diseno_aprobado', 'cancelado'],
            'diseno_aprobado': ['materiales', 'cancelado'],
            'materiales': ['bobinado', 'cancelado'],
            'bobinado': ['ensamble', 'cancelado'],
            'ensamble': ['pruebas', 'cancelado'],
            'pruebas': ['control_calidad', 'cancelado'],
            'control_calidad': ['finalizado'],
            'finalizado': ['entregado'],
            'entregado': [],
            'cancelado': [],
        },
        'precondiciones': {},
    },
    'instalacion': {
        'label': 'Instalación',
        'icono': '🚗',
        'color': '#10b981',
        'estados': ['agendado', 'en_sitio', 'instalando', 'pruebas', 'finalizado', 'facturado', 'cancelado'],
        'campos': ['direccion_instalacion', 'tipo_cargador', 'potencia', 'requiere_obra_civil', 'fecha_agendada', 'tecnico_asignado'],
        'transiciones': {
            'agendado': ['en_sitio', 'cancelado'],
            'en_sitio': ['instalando', 'cancelado'],
            'instalando': ['pruebas', 'cancelado'],
            'pruebas': ['finalizado', 'cancelado'],
            'finalizado': ['facturado'],
            'facturado': [],
            'cancelado': [],
        },
        'precondiciones': {},
    },
}


def get_estado_inicial(tipo):
    """Return the initial estado for a given OT type."""
    if tipo in TIPOS_OT and TIPOS_OT[tipo]['estados']:
        return TIPOS_OT[tipo]['estados'][0]
    return 'recibido'


def get_valid_transitions(tipo, from_estado):
    """Get list of valid next states from a given state for a given OT type."""
    if tipo not in TIPOS_OT:
        return []
    return TIPOS_OT[tipo].get('transiciones', {}).get(from_estado, [])


def can_transition(tipo, from_estado, to_estado, wo_data=None):
    """
    Validate if a state transition is allowed.
    
    Args:
        tipo: OT type (reparacion, fabricacion, instalacion)
        from_estado: current estado
        to_estado: desired estado
        wo_data: dict with WO fields for precondition checks (optional)
    
    Returns:
        (bool, str) — (is_valid, error_message)
    """
    if tipo not in TIPOS_OT:
        return False, f'Tipo de OT inválido: {tipo}'
    
    tipo_info = TIPOS_OT[tipo]
    
    # Validate estados exist in this tipo
    if from_estado not in tipo_info['estados']:
        return False, f'Estado actual "{from_estado}" no es válido para tipo {tipo}'
    
    if to_estado not in tipo_info['estados']:
        return False, f'Estado destino "{to_estado}" no es válido para tipo {tipo}'
    
    # Same estado is fine (no-op)
    if from_estado == to_estado:
        return True, ''
    
    # Check transition graph
    valid_next = tipo_info.get('transiciones', {}).get(from_estado, [])
    if to_estado not in valid_next:
        estados_permitidos = ', '.join(valid_next) if valid_next else 'ninguno (estado final)'
        return False, f'No se puede pasar de "{from_estado}" a "{to_estado}". Estados permitidos: {estados_permitidos}'
    
    # Check preconditions
    precondiciones = tipo_info.get('precondiciones', {}).get(to_estado, [])
    if precondiciones and wo_data:
        for campo in precondiciones:
            valor = wo_data.get(campo)
            if not valor:
                return False, f'Se requiere el campo "{campo}" para pasar a estado "{to_estado}"'
    
    return True, ''


def validate_wo_fields(tipo, data):
    """
    Validate that required fields for a given OT type are present.
    
    Args:
        tipo: OT type
        data: dict with WO data
    
    Returns:
        (bool, str) — (is_valid, error_message)
    """
    if tipo not in TIPOS_OT:
        return False, f'Tipo de OT inválido: {tipo}'
    
    # Basic fields always required
    if not data.get('cliente', {}).get('nombre', '').strip():
        return False, 'El nombre del cliente es requerido'
    
    return True, ''