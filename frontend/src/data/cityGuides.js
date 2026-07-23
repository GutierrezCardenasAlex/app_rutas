export const eventGuides = [
  {
    id: "chutillos",
    title: "Ch'utillos",
    subtitle: "Recorrido principal y movilidad para la fiesta",
    type: "Fiesta mayor",
    dateLabel: "Agosto - septiembre",
    description:
      "Marca el recorrido por donde pasaran las fraternidades y ayuda a encontrar lineas cercanas para llegar o salir del evento.",
    routeColor: "#dc2626",
    route: [
      [-19.58992, -65.75761],
      [-19.58869, -65.75642],
      [-19.58736, -65.75521],
      [-19.58583, -65.75409],
      [-19.58425, -65.75317],
      [-19.58272, -65.75221],
      [-19.58134, -65.75124],
    ],
    fraternities: [
      { name: "Fraternidad Tinkus", time: "09:00", meetingPoint: "Concentracion inicial" },
      { name: "Morenada Central", time: "10:30", meetingPoint: "Av. civica" },
      { name: "Caporales Potosi", time: "12:00", meetingPoint: "Ingreso al centro" },
    ],
  },
  {
    id: "convites",
    title: "Convites",
    subtitle: "Ensayos, entradas previas y puntos de concentracion",
    type: "Evento previo",
    dateLabel: "Previo a Ch'utillos",
    description:
      "Organiza los convites con horarios, fraternidades y puntos donde la gente puede acercarse usando lineas cercanas.",
    routeColor: "#f97316",
    route: [
      [-19.58695, -65.76016],
      [-19.58558, -65.75883],
      [-19.58422, -65.75762],
      [-19.58291, -65.75636],
      [-19.58184, -65.75493],
    ],
    fraternities: [
      { name: "Ensayo fraternidades", time: "18:30", meetingPoint: "Punto de partida" },
      { name: "Convite zona centro", time: "19:30", meetingPoint: "Plaza cercana" },
    ],
  },
];

export const cityPlaces = [
  {
    id: "casa-moneda",
    name: "Casa Nacional de Moneda",
    category: "Turistico",
    description: "Uno de los lugares historicos mas importantes de Potosi.",
    position: [-19.58918, -65.75354],
  },
  {
    id: "plaza-10",
    name: "Plaza 10 de Noviembre",
    category: "Turistico",
    description: "Punto central para orientarse y conectar con varias calles del centro.",
    position: [-19.58837, -65.75378],
  },
  {
    id: "cerro-rico",
    name: "Cerro Rico",
    category: "Turistico",
    description: "Referencia turistica y patrimonial de la ciudad.",
    position: [-19.61726, -65.74647],
  },
  {
    id: "mercado-chuquimia",
    name: "Mercado Chuquimia",
    category: "Referencia",
    description: "Punto util para buscar lineas registradas y rutas cercanas.",
    position: [-19.57992, -65.75478],
  },
  {
    id: "discotecas-centro",
    name: "Zona de discotecas del centro",
    category: "Diversion",
    description: "Referencia nocturna para encontrar movilidad y no perderse al salir.",
    position: [-19.58765, -65.75506],
  },
];
