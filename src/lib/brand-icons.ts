export type BrandIconName =
  | 'ayuda'
  | 'calendario'
  | 'cereza-glow'
  | 'cita-confirmada'
  | 'como-llegar'
  | 'comprobante'
  | 'contacto'
  | 'cualquier-profesional'
  | 'cupon'
  | 'duracion'
  | 'foto-inspiracion'
  | 'french'
  | 'gel-retiro'
  | 'glazed-cateye'
  | 'horario'
  | 'iniciar-sesion'
  | 'instagram'
  | 'lista-espera'
  | 'nail-art-3d'
  | 'pago-despues'
  | 'pies-pedispa'
  | 'profesional'
  | 'retiro-lima'
  | 'servicio'
  | 'transferencia-spei'
  | 'ubicacion'
  | 'unas-esculturales'
  | 'whatsapp';

export interface BrandIconNode {
  t: 'g' | 'path' | 'circle' | 'rect' | 'mask';
  a: Readonly<Record<string, string>>;
  c?: readonly BrandIconNode[];
}

export const BRAND_ICONS: Readonly<Record<BrandIconName, readonly BrandIconNode[]>> = {
  "ayuda": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M16 4.96c-6.03 0-10.8 4.13-10.8 9.44 0 2.74 1.2 5.18 3.18 6.93l-.74 5.05 5.57-2.63c.9.25 1.83.37 2.79.37 6.04 0 10.8-4.17 10.8-9.72 0-5.31-4.76-9.44-10.8-9.44Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M13.05 11.86a2.98 2.98 0 1 1 4.7 2.52c-1.04.69-1.73 1.06-1.73 2.22",
            "fill": "none",
            "strokeWidth": "1.71"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "16.02",
            "cy": "19.61",
            "r": "1.02",
            "fill": "currentColor",
            "stroke": "none"
          }
        }
      ]
    }
  ],
  "calendario": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "rect",
          "a": {
            "x": "5.46",
            "y": "6.6",
            "width": "21.08",
            "height": "20.2",
            "rx": "3.45",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M5.55 12.1h20.9M11.04 4.8v4.1m9.92-4.1v4.1",
            "fill": "none",
            "strokeWidth": "1.72"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "11.7",
            "cy": "17.33",
            "r": "1.04",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "20.3",
            "cy": "17.33",
            "r": "1.04",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "21.55",
            "r": "1.55",
            "fill": "currentColor",
            "stroke": "none"
          }
        }
      ]
    }
  ],
  "cereza-glow": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M10.91 16.36c.57-5.13 4.44-8.78 8.99-12.3-.91 4.24-.14 7.43 2.02 10.69",
            "fill": "none",
            "strokeWidth": "1.63"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M18.83 4.95C15.88 1.78 11.4 2.52 9.49 5.38c3.58 1.27 6.63 1.1 9.34-.43Z",
            "fill": "url(#L)",
            "stroke": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M10.58 15.73c-3.52-1.02-6.16 1.18-6.26 4.87-.11 4.5 2.88 7.39 6.4 7.39 3.85 0 6.76-2.79 6.57-6.66-.16-3.36-2.15-5.61-4.73-5.49-.82.03-1.38.07-1.98-.11Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M21.38 14.77c-3.27-1.15-5.98.77-6.38 4.4-.49 4.4 2.24 7.72 5.87 7.99 3.78.29 6.88-2.17 7.11-5.95.22-3.29-1.55-5.96-4.27-6.26-.81-.1-1.62.02-2.33-.18Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M6.84 20.16c.21-1.05.9-1.9 1.78-2.28m8.94 1.07c.27-.97.96-1.71 1.8-2.08",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "0.94",
            "opacity": ".69"
          }
        }
      ]
    }
  ],
  "cita-confirmada": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "mask",
          "a": {
            "id": "M"
          },
          "c": [
            {
              "t": "rect",
              "a": {
                "width": "32",
                "height": "32",
                "fill": "white",
                "stroke": "none"
              }
            },
            {
              "t": "path",
              "a": {
                "d": "m11.28 15.92 3.13 3.11 6.33-6.33",
                "fill": "none",
                "stroke": "black",
                "strokeWidth": "2.05",
                "strokeLinecap": "round"
              }
            }
          ]
        },
        {
          "t": "path",
          "a": {
            "d": "M16 5.5a10.52 10.52 0 1 1 0 21.04A10.52 10.52 0 0 1 16 5.5Z",
            "fill": "url(#L)",
            "mask": "url(#M)"
          }
        }
      ]
    }
  ],
  "como-llegar": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "m5.35 14.95 19.4-9.35c.91-.44 1.84.47 1.4 1.4l-9.35 19.4c-.43.9-1.78.7-1.95-.3l-1.42-8.43-7.7-.83c-1.03-.11-1.31-1.44-.38-1.89Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m13.43 17.67 5.92-5.79",
            "fill": "none",
            "strokeWidth": "1.46"
          }
        }
      ]
    }
  ],
  "comprobante": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M23.53 14.3V6.93a2.24 2.24 0 0 0-2.24-2.24H8.36a2.24 2.24 0 0 0-2.24 2.24V26.5l3.26-1.81 3.23 1.81 2.3-1.33",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M10.63 10.86h8.39m-8.39 4.03h5.56m-5.56 4.03h2.89",
            "fill": "none",
            "strokeWidth": "1.53"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "22.45",
            "cy": "22.25",
            "r": "5.48",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M22.45 24.72V19.5m-2 1.9 2-1.9 2 1.9",
            "fill": "none",
            "strokeWidth": "1.32"
          }
        }
      ]
    }
  ],
  "contacto": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M22.45 21.25a6.7 6.7 0 0 0 3.55-1.9 5.5 5.5 0 0 0-.24-8.45",
            "fill": "none",
            "strokeWidth": "1.53"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M13.6 5.7c-5.7 0-9.9 3.55-9.9 8.21 0 2.2.98 4.21 2.71 5.67l-.88 4.62 4.9-2.1c.99.3 2.08.46 3.17.46 5.68 0 9.91-3.6 9.91-8.65S19.28 5.7 13.6 5.7Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "9.85",
            "cy": "14.15",
            "r": "1.04",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "13.6",
            "cy": "14.15",
            "r": "1.04",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "17.35",
            "cy": "14.15",
            "r": "1.04",
            "fill": "currentColor",
            "stroke": "none"
          }
        }
      ]
    }
  ],
  "cualquier-profesional": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M21.58 6.9a3.94 3.94 0 0 1 0 7.67m1.17 3.87c3.11.68 5.5 2.78 5.5 5.54v1.19",
            "fill": "none",
            "strokeWidth": "1.54"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "12.6",
            "cy": "10.65",
            "r": "4.1",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M4.21 24.25c0-3.96 3.53-6.78 8.39-6.78s8.39 2.82 8.39 6.78v1.59H4.21Z",
            "fill": "url(#W)"
          }
        }
      ]
    }
  ],
  "cupon": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M7.43 8.66h17.14a2.57 2.57 0 0 1 2.57 2.57v2.19a2.58 2.58 0 1 0 0 5.16v2.19a2.57 2.57 0 0 1-2.57 2.57H7.43a2.57 2.57 0 0 1-2.57-2.57v-2.19a2.58 2.58 0 1 0 0-5.16v-2.19a2.57 2.57 0 0 1 2.57-2.57Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m11.95 19.42 5.21-6.95m4.36-.87v1.65m0 1.93v1.65m0 1.93v1.65",
            "fill": "none",
            "strokeWidth": "1.35"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "11.91",
            "cy": "13.65",
            "r": "0.94",
            "fill": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "17.06",
            "cy": "18.36",
            "r": "0.94",
            "fill": "none"
          }
        }
      ]
    }
  ],
  "duracion": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M13.73 4.55h4.54M16 4.55v3.01m6.91 2.6 1.34-1.34",
            "fill": "none",
            "strokeWidth": "1.72"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "17.28",
            "r": "9.3",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M16 12.2v5.24l3 1.75",
            "fill": "none",
            "strokeWidth": "1.77"
          }
        }
      ]
    }
  ],
  "foto-inspiracion": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M20.47 7.1H7.72a2.63 2.63 0 0 0-2.63 2.63v12.54a2.63 2.63 0 0 0 2.63 2.63h16.56a2.63 2.63 0 0 0 2.63-2.63V13.8",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m5.58 21.22 6.27-6.17 4.83 4.54 3.12-2.66 6.6 5.4",
            "fill": "none",
            "strokeWidth": "1.47"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "10.89",
            "cy": "11.99",
            "r": "1.08",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "g",
          "a": {
            "transform": "translate(25.51 7.63) scale(1.35)"
          },
          "c": [
            {
              "t": "path",
              "a": {
                "d": "M0-3.4C.45-1.12 1.12-.45 3.4 0 1.12.45.45 1.12 0 3.4-.45 1.12-1.12.45-3.4 0-1.12-.45-.45-1.12 0-3.4Z",
                "fill": "url(#L)",
                "stroke": "none"
              }
            }
          ]
        }
      ]
    }
  ],
  "french": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M8.85 13.35c0-5.02 3.13-8.47 7.15-8.47s7.15 3.45 7.15 8.47v10.38a3.1 3.1 0 0 1-3.1 3.1h-8.1a3.1 3.1 0 0 1-3.1-3.1Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M8.85 13.35c0-5.02 3.13-8.47 7.15-8.47s7.15 3.45 7.15 8.47c-1.97-1.22-4.47-1.9-7.15-1.9s-5.18.68-7.15 1.9Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M11.61 9.45c.73-.98 1.72-1.65 2.78-1.89",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "0.86",
            "opacity": ".69"
          }
        }
      ]
    }
  ],
  "gel-retiro": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "m6.95 18.89 5 4.52c-.9 3.01-3.73 4.45-7.71 3.85 1.08-1.15 1.43-2.22 1.49-3.67.06-1.86.33-3.17 1.22-4.7Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m6.95 18.89 11.62-13.3a2.72 2.72 0 1 1 4.1 3.58L11.95 23.41Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m11.22 17.29 7.26-8.29",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "0.94",
            "opacity": ".69"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M23.5 18.9c.74 0 4 4.58 4 6.76a4 4 0 1 1-8 0c0-2.18 3.26-6.76 4-6.76Z",
            "fill": "url(#W)"
          }
        }
      ]
    }
  ],
  "glazed-cateye": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M7.48 13.25c0-4.93 3.15-8.4 7.13-8.4s7.13 3.47 7.13 8.4v10.32a3.07 3.07 0 0 1-3.07 3.07h-8.12a3.07 3.07 0 0 1-3.07-3.07Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M7.58 19.13c4.55-2.13 9.85-6.43 13.5-10.62.57 1.2.65 2.71.65 4.11-3.79 4.01-8.95 7.86-14.15 10.02Z",
            "fill": "url(#L)",
            "stroke": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M9.4 20c3.68-1.91 7.53-4.93 10.53-8.05",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "0.93",
            "opacity": ".69"
          }
        },
        {
          "t": "g",
          "a": {
            "transform": "translate(25.28 7.48) scale(0.85)"
          },
          "c": [
            {
              "t": "path",
              "a": {
                "d": "M0-3.4C.45-1.12 1.12-.45 3.4 0 1.12.45.45 1.12 0 3.4-.45 1.12-1.12.45-3.4 0-1.12-.45-.45-1.12 0-3.4Z",
                "fill": "url(#L)",
                "stroke": "none"
              }
            }
          ]
        }
      ]
    }
  ],
  "horario": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "16",
            "r": "10.1",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M16 10.2v6.1l3.9 2.15",
            "fill": "none",
            "strokeWidth": "1.82"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "16",
            "r": "0.97",
            "fill": "currentColor",
            "stroke": "none"
          }
        }
      ]
    }
  ],
  "iniciar-sesion": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M13.05 10.03V6.92a1.73 1.73 0 0 1 1.73-1.73h8.82a2.78 2.78 0 0 1 2.78 2.78v16.06a2.78 2.78 0 0 1-2.78 2.78h-8.82a1.73 1.73 0 0 1-1.73-1.73v-3.11",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M5.42 16h14.01m-4.55-4.55L19.43 16l-4.55 4.55",
            "fill": "none",
            "strokeWidth": "1.94"
          }
        }
      ]
    }
  ],
  "instagram": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "rect",
          "a": {
            "x": "5.35",
            "y": "5.35",
            "width": "21.3",
            "height": "21.3",
            "rx": "5.4",
            "fill": "url(#W)"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "16",
            "r": "4.75",
            "fill": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "22.1",
            "cy": "9.93",
            "r": "1.28",
            "fill": "currentColor",
            "stroke": "none"
          }
        }
      ]
    }
  ],
  "lista-espera": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M21.01 12.88V7.32a2.59 2.59 0 0 0-2.59-2.59H7.7a2.59 2.59 0 0 0-2.59 2.59v16.62a2.59 2.59 0 0 0 2.59 2.59h5.46",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M9.13 10.4h7.87m-7.87 4.23h5.66m-5.66 4.23h2.19",
            "fill": "none",
            "strokeWidth": "1.72"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "21.38",
            "cy": "21.5",
            "r": "6.64",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M21.38 17.63v3.98l2.44 1.48",
            "fill": "none",
            "strokeWidth": "1.5"
          }
        }
      ]
    }
  ],
  "nail-art-3d": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "m11.54 18.32 8.32-11.53a2.43 2.43 0 1 1 3.99 2.78l-8.5 11.42Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m15.91 15.88 4.94-6.75",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "0.82",
            "opacity": ".69"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M11.54 18.32c-2.63-.16-4.24 1.01-4.66 3.64-.27 1.72-.79 2.56-1.99 3.58 4.74.93 8.69-.17 10.46-4.55Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m21.56 19.5 3.6-1 3.04 2.62-1.05 4.33-4.02 1.33-3.39-2.89Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "m21.56 19.5 1.26 3.65 5.38-2.03m-5.38 2.03.31 3.63",
            "fill": "none",
            "strokeWidth": "1.19"
          }
        }
      ]
    }
  ],
  "pago-despues": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "18.08",
            "r": "8.77",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M16 12.82v5.14l3.06 1.76m-7.8-12.7c2.39-2.1 6.64-2.69 9.87.02m-2.66.27 2.66-.27.13-2.61",
            "fill": "none",
            "strokeWidth": "1.69"
          }
        }
      ]
    }
  ],
  "pies-pedispa": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M9.83 19.1c0-1.43-.25-2.2-.23-3.36.04-2.04 1.73-3.13 4.05-3.39 2.85-.32 4.7 1 4.5 3.11-.13 1.42-.95 2.53-1.38 4.15-.66 2.46-1.77 3.8-3.67 3.8-2.06 0-3.27-1.56-3.27-4.31Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "18.47",
            "cy": "8.73",
            "r": "1.67",
            "fill": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "14.49",
            "cy": "8.77",
            "r": "1.07",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "11.19",
            "cy": "9.88",
            "r": "0.92",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "circle",
          "a": {
            "cx": "8.64",
            "cy": "11.85",
            "r": "0.8",
            "fill": "currentColor",
            "stroke": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M6.2 26.58q2.4-1.5 4.8 0t4.8 0 4.8 0 4.8 0",
            "fill": "none",
            "strokeWidth": "1.58"
          }
        }
      ]
    }
  ],
  "profesional": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "circle",
          "a": {
            "cx": "16",
            "cy": "10.5",
            "r": "4.28",
            "fill": "none"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M6.8 25.32v-1.27c0-3.9 4.01-6.72 9.2-6.72s9.2 2.82 9.2 6.72v1.27a.9.9 0 0 1-.9.9H7.7a.9.9 0 0 1-.9-.9Z",
            "fill": "url(#W)"
          }
        }
      ]
    }
  ],
  "retiro-lima": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "g",
          "a": {
            "transform": "rotate(43 16 16)"
          },
          "c": [
            {
              "t": "rect",
              "a": {
                "x": "12.2",
                "y": "3.78",
                "width": "7.6",
                "height": "24.44",
                "rx": "3.8",
                "fill": "url(#W)"
              }
            },
            {
              "t": "path",
              "a": {
                "d": "M12.5 21.75h7M14.74 10.4l2.52-1.15m-2.52 4.67 2.52-1.15m-2.52 4.67 2.52-1.15",
                "fill": "none",
                "strokeWidth": "1.23"
              }
            }
          ]
        }
      ]
    }
  ],
  "servicio": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M14.2 10.17c.05-3.78 2.22-6.35 5.43-6.35 3.22 0 5.38 2.51 5.38 6.31v11.13a2 2 0 0 1-1.64 1.97",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M7.35 13.55c0-3.85 2.61-6.64 6.16-6.64 3.54 0 6.15 2.79 6.15 6.64v10.98a2.78 2.78 0 0 1-2.78 2.78h-6.75a2.78 2.78 0 0 1-2.78-2.78Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M9.75 14.1c0-1.96.77-3.35 2.03-4.03",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "1.14",
            "opacity": ".69"
          }
        }
      ]
    }
  ],
  "transferencia-spei": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M5.22 10.07H26.8m-5.2-4.93 5.2 4.93L21.6 15m5.18 6.93H5.2m5.2-4.93-5.2 4.93 5.2 4.93",
            "fill": "none",
            "strokeWidth": "1.9"
          }
        }
      ]
    }
  ],
  "ubicacion": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M16 3.9a9.05 9.05 0 0 0-9.05 9.05c0 5.9 6.25 11.52 8.27 13.35.44.4 1.12.4 1.56 0 2.02-1.83 8.27-7.45 8.27-13.35A9.05 9.05 0 0 0 16 3.9ZM16 9.45a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z",
            "fill": "url(#L)",
            "fillRule": "evenodd"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M9.6 11.6a6.4 6.4 0 0 1 3.53-4.48",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "1.14",
            "opacity": ".69"
          }
        }
      ]
    }
  ],
  "unas-esculturales": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M16 3.67c.98 0 3.78 3.39 5.33 6.72 2 4.28 2.93 8.45 2.08 11.54-.82 2.98-3.36 5.33-7.41 5.33s-6.59-2.35-7.41-5.33c-.85-3.09.08-7.26 2.08-11.54C12.22 7.06 15.02 3.67 16 3.67Z",
            "fill": "url(#L)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M14.93 8.93c-1.6 2.49-2.76 5.05-3.31 7.96",
            "fill": "none",
            "className": "lk-ic-glint",
            "strokeWidth": "1.19",
            "opacity": ".69"
          }
        }
      ]
    }
  ],
  "whatsapp": [
    {
      "t": "g",
      "a": {
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeLinecap": "round",
        "strokeWidth": "1.72",
        "fill": "none"
      },
      "c": [
        {
          "t": "path",
          "a": {
            "d": "M16 4.94A10.76 10.76 0 0 0 6.54 20.8L5.2 26.5l5.86-1.38A10.76 10.76 0 1 0 16 4.94Z",
            "fill": "url(#W)"
          }
        },
        {
          "t": "path",
          "a": {
            "d": "M13.14 10.57c-.47-.4-1.04-.12-1.42.3-1.88 2.03.15 5.1 1.91 6.84 1.76 1.75 4.83 3.77 6.79 1.87.41-.4.63-1.03.21-1.43l-2.04-1.3c-.34-.2-.63-.09-.88.18l-.75.78a9.12 9.12 0 0 1-3.2-3.15l.74-.77c.25-.27.31-.62.14-.89Z",
            "fill": "none",
            "strokeWidth": "1.44"
          }
        }
      ]
    }
  ]
};
