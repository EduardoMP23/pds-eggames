'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const THEMES = [
  { name: 'Coisas quentes',                       scale: '1-gelado / 100-fervendo'            },
  { name: 'Coisas geladas',                        scale: '1-morno / 100-congelante'           },
  { name: 'Coisas que queimam',                    scale: '1-frio / 100-queima demais'         },
  { name: 'Lugares frios do mundo',                scale: '1-tropical / 100-congelante'        },
  { name: 'Bebidas pela temperatura',              scale: '1-gelado / 100-quente'              },
  { name: 'Coisas grandes',                        scale: '1-minúsculo / 100-gigantesco'       },
  { name: 'Coisas pesadas',                        scale: '1-levíssimo / 100-pesadíssimo'      },
  { name: 'Coisas altas',                          scale: '1-rente ao chão / 100-altíssimo'    },
  { name: 'Coisas rápidas',                        scale: '1-lentíssimo / 100-velocíssimo'     },
  { name: 'Coisas lentas',                         scale: '1-veloz / 100-lentíssimo'           },
  { name: 'Meios de transporte por velocidade',    scale: '1-lentíssimo / 100-velocíssimo'     },
  { name: 'Animais velozes',                       scale: '1-lentíssimo / 100-velocíssimo'     },
  { name: 'Esportes pela intensidade',             scale: '1-relaxante / 100-intensíssimo'     },
  { name: 'Coisas caras',                          scale: '1-baratíssimo / 100-caríssimo'      },
  { name: 'Profissões pelo salário',               scale: '1-baixo salário / 100-milionário'   },
  { name: 'Carros por preço',                      scale: '1-popular / 100-supercarro'         },
  { name: 'Coisas assustadoras',                   scale: '1-inofensivo / 100-apavorante'      },
  { name: 'Animais perigosos',                     scale: '1-inofensivo / 100-letal'           },
  { name: 'Filmes de terror pelo medo que dão',    scale: '1-tranquilo / 100-apavorante'       },
  { name: 'Situações constrangedoras',             scale: '1-normal / 100-mortificante'        },
  { name: 'Doenças pela gravidade',                scale: '1-gripezinha / 100-fatal'           },
  { name: 'Insetos pelo nojo',                     scale: '1-fofo / 100-repugnante'            },
  { name: 'Coisas apimentadas',                    scale: '1-sem pimenta / 100-pimenta pura'   },
  { name: 'Comidas calóricas',                     scale: '1-light / 100-hipercalórico'        },
  { name: 'Frutas pela doçura',                    scale: '1-azedo / 100-docíssimo'            },
  { name: 'Comidas exóticas pela estranheza',      scale: '1-familiar / 100-estranhíssimo'     },
  { name: 'Famosos mais conhecidos no mundo',      scale: '1-desconhecido / 100-famoso'        },
  { name: 'Filmes mais assistidos',                scale: '1-obscuro / 100-blockbuster'        },
  { name: 'Músicas mais tocadas',                  scale: '1-raridade / 100-hit mundial'       },
  { name: 'Esportes mais praticados',              scale: '1-raro / 100-popular'               },
  { name: 'Marcas mais reconhecidas',              scale: '1-desconhecida / 100-global'        },
  { name: 'Países mais visitados',                 scale: '1-isolado / 100-turístico'          },
  { name: 'Manga/anime famoso',                    scale: '1-desconhecido / 100-famoso'        },
  { name: 'Coisas relaxantes',                     scale: '1-estressante / 100-relaxante'      },
  { name: 'Coisas estressantes',                   scale: '1-tranquilo / 100-estressante'      },
  { name: 'Coisas fofas',                          scale: '1-feio / 100-fofíssimo'             },
  { name: 'Coisas difíceis de aprender',           scale: '1-fácil / 100-muito difícil'        },
  { name: 'Esportes difíceis de praticar',         scale: '1-fácil / 100-muito difícil'        },
  { name: 'Idiomas difíceis',                      scale: '1-fácil / 100-muito difícil'        },
  { name: 'Jogos pela dificuldade',                scale: '1-fácil / 100-impossível'           },
  { name: 'Tarefas domésticas pelo tempo gasto',   scale: '1-rápido / 100-demoradíssimo'       },
  { name: 'Coisas raras de encontrar',             scale: '1-comum / 100-raríssimo'            },
  { name: 'Apps mais usados',                      scale: '1-obscuro / 100-indispensável'      },
  { name: 'Invenções que mudaram o mundo',         scale: '1-irrelevante / 100-revolucionário' },
  { name: 'Lugares bonitos para visitar',          scale: '1-sem graça / 100-deslumbrante'     },
  { name: 'Coisas barulhentas',                    scale: '1-silencioso / 100-ensurdecedor'    },
  { name: 'Coisas fedidas',                        scale: '1-sem cheiro / 100-insuportável'    },
  { name: 'Sobremesas pelo sabor',                 scale: '1-sem graça / 100-delicioso'        },
  { name: 'Pratos pela dificuldade de preparo',    scale: '1-simples / 100-muito difícil'      },
  { name: 'Profissões pela dificuldade de formação', scale: '1-simples / 100-muito difícil'   },
  { name: 'Momentos vergonhosos',                  scale: '1-normal / 100-mortificante'        },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickTheme(usedThemes) {
  const available = THEMES.filter(t => !usedThemes.includes(t.name));
  const pool = available.length > 0 ? available : THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function dealNumbers(players) {
  const numbers = shuffle(Array.from({ length: 100 }, (_, i) => i + 1));
  const hands = {};
  players.forEach((p, i) => { hands[p.playerId] = numbers[i]; });
  return hands;
}

function initState(players) {
  const picked = pickTheme([]);
  return {
    players:    players.map(p => ({ playerId: p.playerId, playerName: p.playerName })),
    theme:      picked.name,
    themeScale: picked.scale,
    usedThemes: [picked.name],
    hands:      dealNumbers(players),
    round:      1,
    status:     'playing',
    winner:     null,
    winnerName: null,
  };
}

function applyAction(state, action, playerId) {
  if (action.type === 'next-round') {
    const picked = pickTheme(state.usedThemes);
    state.theme      = picked.name;
    state.themeScale = picked.scale;
    state.usedThemes.push(picked.name);
    state.hands = dealNumbers(state.players);
    state.round++;
    return {};
  }
  return { error: 'Ação inválida' };
}

function getPublicState(state, forPlayerId) {
  return {
    theme:      state.theme,
    themeScale: state.themeScale,
    round:      state.round,
    myNumber:   state.hands[forPlayerId] ?? null,
    myPlayerId: forPlayerId,
    players:    state.players.map(p => ({ playerId: p.playerId, playerName: p.playerName })),
    status:     state.status,
    winner:     state.winner,
    winnerName: state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, MIN_PLAYERS, MAX_PLAYERS };
