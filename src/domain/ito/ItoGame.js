'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const THEMES = [
  { name: 'Mangá / anime famoso',                                                               scale: '1-desconhecido / 100-famoso'                                    },
  { name: 'Pessoas famosas que você gostaria de ser',                                           scale: '1-não gostaria de ser / 100-gostaria de ser'                    },
  { name: 'Coisas que te dão medo',                                                             scale: '1-nem um sustinho / 100-morreria de medo'                       },
  { name: 'Coisas que você gostaria de fotografar',                                             scale: '1-não vale o clique / 100-faria um book'                        },
  { name: 'Coisas importantes na vida',                                                         scale: '1-não é nada / 100-importantíssimo'                             },
  { name: 'Esportes mais conhecidos',                                                           scale: '1-pouca gente conhece / 100-muito popular'                      },
  { name: 'Lugares onde você gostaria de morar',                                                scale: '1-não ficaria lá 5 minutos / 100-passaria lá a eternidade'      },
  { name: 'Itens do dia a dia que poderiam ser boas armas',                                     scale: '1-nem arranha / 100-arma forte'                                 },
  { name: 'Coisas que você ficaria olhando com admiração o dia inteiro',                        scale: '1-nem pararia pra olhar / 100-ficaria olhando por horas'        },
  { name: 'Habilidades importantes para ser líder',                                             scale: '1-não importante / 100-essencial'                               },
  { name: 'Contos de fadas populares',                                                          scale: '1-desconhecido / 100-popular'                                   },
  { name: 'Poderes especiais que você gostaria de ter',                                         scale: '1-não gostaria / 100-gostaria'                                  },
  { name: 'Coisas que você não conseguiria perdoar',                                            scale: '1-nada demais / 100-imperdoável'                                },
  { name: 'Mentiras que você acreditaria',                                                      scale: '1-não acreditaria / 100-acreditaria com certeza'                },
  { name: 'Coisas que te fazem feliz',                                                          scale: '1-não te faz feliz / 100-felicidade pura'                       },
  { name: 'Personagens da ficção com quem você gostaria de ter um encontro',                    scale: '1-não valeria um encontro / 100-provavelmente casaria'          },
  { name: 'Filmes conhecidos',                                                                  scale: '1-ninguém viu / 100-todo mundo assistiu'                        },
  { name: 'Coisas nas quais você gostaria de ficar em imersão',                                 scale: '1-não, obrigado / 100-quero uma piscina cheia disso'            },
  { name: 'Sabores de sorvete que poderiam ser deliciosos',                                     scale: '1-credo, horrível! / 100-comeria toneladas'                     },
  { name: 'Itens / armas que você gostaria de ter para lutar contra zumbis',                    scale: '1-é pra fazer cosquinha? / 100-adiós, zumbi!'                  },
  { name: 'Atletas famosos',                                                                    scale: '1-sei nem quem é / 100-grande campeão'                          },
  { name: 'Personagens da ficção que você gostaria de ser',                                     scale: '1-não seria / 100-seria muito'                                  },
  { name: 'Coisas que cheiram bem',                                                             scale: '1-cheiro normal / 100-faria um perfume disso'                   },
  { name: 'Coisas que você gostaria de fazer quando se aposentar',                              scale: '1-não faria / 100-faria com toda certeza'                       },
  { name: 'Coisas importantes para fazer sucesso nas mídias sociais',                           scale: '1-pouco importante / 100-obrigatório'                           },
  { name: 'Comidas famosas',                                                                    scale: '1-pouca gente conhece / 100-encontradas em todo o mundo'        },
  { name: 'Celebridades de filmes e séries mais conhecidas da atualidade',                      scale: '1-fez poucas participações / 100-está sempre nos lançamentos'   },
  { name: 'Coisas que você gostaria de ter como souvenir',                                      scale: '1-não teria isso / 100-teria mais de mil'                       },
  { name: 'Coisas difíceis de suportar',                                                        scale: '1-não tão difícil / 100-praticamente impossível'                },
  { name: 'Habilidades essenciais para um comediante',                                          scale: '1-desnecessária / 100-obrigatória'                              },
  { name: 'Figuras históricas populares',                                                       scale: '1-sei nem quem é / 100-figura importante'                       },
  { name: 'Coisas que você desejava quando criança',                                            scale: '1-nem queria / 100-queria pra caramba'                          },
  { name: 'Coisas úteis em uma casa',                                                           scale: '1-inútil / 100-muito útil'                                      },
  { name: 'Coisas que fazem você se sentir amado(a)',                                           scale: '1-não faz / 100-é puro amor'                                    },
  { name: 'Canções famosas',                                                                    scale: '1-ninguém conhece / 100-todo mundo canta junto'                 },
  { name: 'Marcas mais valiosas',                                                               scale: '1-vale pouco / 100-vale bilhões'                                },
  { name: 'Coisas que você quer fazer logo quando acorda',                                      scale: '1-não quero fazer / 100-quero muito'                            },
  { name: 'Sons que te fazem feliz',                                                            scale: '1-nem é som / 100-felicidade para os ouvidos'                   },
  { name: 'Pense como um estudante do ensino médio: o que é legal?',                            scale: '1-cringe / 100-super legal'                                     },
  { name: 'Presentes de aniversário mais comuns',                                               scale: '1-ninguém ganha / 100-todo mundo já ganhou'                     },
  { name: 'Vilões mais temíveis',                                                               scale: '1-até eu encarava / 100-me faz ter pesadelos'                   },
  { name: 'Países populares para viajar',                                                       scale: '1-ninguém vai / 100-todo mundo já foi'                          },
  { name: 'Coisas que te fazem feliz quando feitas pelo seu amor',                              scale: '1-pouco feliz / 100-muito feliz'                                },
  { name: 'Animais nos quais você gostaria de montar',                                          scale: '1-não gostaria / 100-queria demais'                             },
  { name: 'Pense como uma criança: o que te faz feliz?',                                        scale: '1-não te faz muito feliz / 100-isso sim é felicidade'           },
  { name: 'Pense como um gato: os lugares mais confortáveis do mundo',                          scale: '1-pouco confortável / 100-muito confortável'                    },
  { name: 'Coisas fofinhas',                                                                    scale: '1-pouco fofinho / 100-um cuti-cuti'                             },
  { name: 'Atividades difíceis de serem feitas sozinho(a)',                                     scale: '1-dá pra fazer / 100-impossível'                                },
  { name: 'Habilidades úteis para o trabalho',                                                  scale: '1-inútil / 100-muito útil'                                      },
  { name: 'Tamanho de animais',                                                                 scale: '1-pequeno / 100-enorme'                                         },
  { name: 'Coisas leves',                                                                       scale: '1-pouco leve / 100-levíssimo'                                   },
  { name: 'Frases estranhas se ditas por uma criança de 5 anos',                                scale: '1-normal / 100-muito estranho'                                  },
  { name: 'Algo que te surpreenderia se fosse achado embaixo de uma pedra no parque',           scale: '1-algo comum / 100-algo surpreendente'                          },
  { name: 'Coisas confiáveis por todo o sempre',                                                scale: '1-pouco confiável / 100-confiável eternamente'                  },
  { name: 'Lugares onde você vai com frequência',                                               scale: '1-vai pouco / 100-vai muito'                                    },
  { name: 'Drinques populares',                                                                 scale: '1-ninguém bebe isso / 100-todo mundo já bebeu'                  },
  { name: 'Pedidos de casamento que te fariam feliz',                                           scale: '1-aquele de passar vergonha / 100-algo memorável'               },
  { name: 'Itens encontrados em um baú do tesouro que você gostaria de ter',                    scale: '1-não gostaria / 100-queria muito'                              },
  { name: 'Tipos de festivais que você gostaria de participar',                                 scale: '1-não iria nem pagando / 100-gastaria o salário pra ir'         },
  { name: 'Brinquedos mais conhecidos',                                                         scale: '1-desconhecido / 100-toda criança já teve um'                   },
  { name: 'Coisas que te deixam com sono',                                                      scale: '1-acordadíssimo / 100-zzzzz…'                                   },
  { name: 'Itens úteis quando você está perdido(a) no deserto',                                 scale: '1-não serve para nada / 100-salvaria sua vida'                  },
  { name: 'Momentos históricos que você visitaria se tivesse uma máquina do tempo',             scale: '1-fuja, louco! / 100-iria agora'                                },
  { name: 'Pense como um vilão: qual seria o personagem heróico que você menos gostaria de enfrentar?', scale: '1-derrotaria facilmente / 100-tenho medo até da sombra' },
  { name: 'Palavras que você gostaria de ouvir',                                                scale: '1-praticamente uma ofensa / 100-mais que um elogio'             },
  { name: 'Veículos mais comuns',                                                               scale: '1-nunca vi / 100-tem um em cada esquina'                        },
  { name: 'Coisas que te surpreenderiam se saíssem do seu corpo',                               scale: '1-normal / 100-não dá pra imaginar isso'                        },
  { name: 'Alimentos que fazem bem',                                                            scale: '1-nada saudável / 100-puro suco de saúde'                       },
  { name: 'Pense como um cientista: o que você gostaria de descobrir?',                         scale: '1-não gostaria de descobrir / 100-merece um Nobel'              },
  { name: 'Itens úteis para levar a uma ilha deserta',                                          scale: '1-inútil / 100-muito útil'                                      },
  { name: 'Melhores jogos de tabuleiro já lançados',                                            scale: '1-aquele que flopou muito / 100-digno de um prêmio Spiel'       },
  { name: 'Piadas mais engraçadas',                                                             scale: '1-isso é ofensivo / 100-ri litros'                              },
  { name: 'Itens diferentões que você gostaria de ter',                                         scale: '1-nem tanto / 100-isso é muito legal'                           },
  { name: 'Melhores nomes de golpes especiais para gritar',                                     scale: '1-não botou medo / 100-isso sim impõe respeito'                 },
  { name: 'Características de pessoas que você gostaria de ter em seu círculo de amizade',      scale: '1-nada interessante / 100-BFF na certa'                         },
  { name: 'Títulos de livros que te deixariam curioso para saber seu conteúdo',                 scale: '1-ninguém se importa / 100-vou comprar'                         },
  { name: 'Pense como um mago: qual seria o seu feitiço favorito?',                             scale: '1-feitiço comum / 100-usaria toda hora'                         },
  { name: 'Coisas que surpreenderiam se fossem ditas por um professor',                         scale: '1-faz parte da aula / 100-por essa ninguém esperava'            },
  { name: 'Pense como um cachorro: o que te faz feliz?',                                        scale: '1-nada AU-AUdacioso / 100-de balançar a cauda'                  },
  { name: 'As coisas mais bonitas do mundo',                                                    scale: '1-ok / 100-visão do paraíso'                                    },
  { name: 'Os doces mais conhecidos',                                                           scale: '1-nunca vi, nem comi, só ouço falar / 100-vende em todo lugar'  },
  { name: 'Amor verdadeiro ou apenas uma aventura?',                                            scale: '1-aventura / 100-amor verdadeiro'                               },
  { name: 'Pense como um herói: qual seria sua pose? (demonstre-a)',                            scale: '1-lamentável / 100-épica'                                       },
  { name: 'Mundos imaginários que você gostaria de visitar',                                    scale: '1-não gostaria / 100-viveria lá o resto da vida'                },
  { name: 'Coisas populares com crianças',                                                      scale: '1-pouco conhecida / 100-muito famosa'                           },
  { name: 'Os nomes mais legais',                                                               scale: '1-muito comum / 100-meu filho vai ter'                          },
  { name: 'Coisas que você faz quando está de bom humor',                                       scale: '1-nunca faço / 100-faço muito'                                  },
  { name: 'Pense como um explorador: que lugares te deixam animado?',                           scale: '1-um desânimo só / 100-bora lá, agora?'                         },
  { name: 'Habilidades úteis em relacionamentos',                                               scale: '1-inútil / 100-essencial'                                       },
  { name: 'Personagens mais fortes da ficção',                                                  scale: '1-fraco demais / 100-indestrutível'                             },
  { name: 'Lugares onde mais acontecem encontros românticos',                                   scale: '1-poucos encontros / 100-está acontecendo um agora'             },
  { name: 'Um único prato pra comer até o fim da vida',                                         scale: '1-não escolheria / 100-comeria agora, inclusive'                },
  { name: 'Ações e atitudes que exigem coragem',                                                scale: '1-nada corajoso / 100-pura coragem'                             },
  { name: 'Pense como um adolescente: o que seria algo ruim se acontecesse durante a aula?',    scale: '1-nem tão ruim / 100-que vergonha!'                             },
  { name: 'Se você tivesse um alter ego, o que gostaria que ele fosse?',                        scale: '1-não gostaria / 100-é meu tipo'                                },
  { name: 'Personagens fictícios com os piores temperamentos',                                  scale: '1-de boas / 100-explosivo'                                      },
  { name: 'Habilidades importantes para um streamer',                                           scale: '1-desnecessária / 100-obrigatória'                              },
  { name: 'Caretas engraçadas (faça-as)',                                                        scale: '1-isso é ridículo / 100-muito engraçado!'                       },
  { name: 'Coisas que você ficaria feliz em encontrar no seu bolso ou bolsa',                   scale: '1-nada feliz / 100-alegria pura'                                },
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

// Saída individual: libera o número do jogador — o next-round redistribui
// os números só entre os jogadores restantes.
function removePlayer(state, playerId) {
  delete state.hands[playerId];
  state.players = state.players.filter(p => p.playerId !== playerId);
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

module.exports = { initState, applyAction, getPublicState, removePlayer, MIN_PLAYERS, MAX_PLAYERS };
