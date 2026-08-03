/* eslint-disable no-console */
/**
 * Curated famous-only stars. Genres: pop | rock | rap | kpop
 * Run: node scripts/generate-artist-catalog.js
 */
const fs = require("fs");
const path = require("path");

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x).trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

const catalog = [];
const seen = new Set();

function add(name, gender, region, genre, country) {
  const n = String(name || "").trim();
  if (!n) return;
  const key = region + "|" + n.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  catalog.push({ name: n, gender, region, genre, country });
}

function addMany(csv, gender, region, genre, country) {
  for (const n of uniq(String(csv).split(","))) {
    add(n, gender, region, genre, country);
  }
}

// WESTERN POP
addMany("Adele,Beyoncé,Taylor Swift,Billie Eilish,Ariana Grande,Lady Gaga,Rihanna,Dua Lipa,Sia,Lana Del Rey,Katy Perry,Miley Cyrus,Olivia Rodrigo,Sabrina Carpenter,Chappell Roan,Tate McRae,Madonna,Britney Spears,Christina Aguilera,Mariah Carey,Whitney Houston,Celine Dion,Shakira,Camila Cabello,Selena Gomez,Demi Lovato,Kylie Minogue,Jessie J,Rita Ora,Ellie Goulding,Ava Max,Bebe Rexha,Meghan Trainor,Alessia Cara,Halsey,Lorde,Charli XCX,P!nk,Kelly Clarkson,Jennifer Lopez,Gwen Stefani,Kesha,Carly Rae Jepsen,Alicia Keys,Norah Jones,Sade,Amy Winehouse", "female", "western", "pop", "US");
addMany("Ed Sheeran,Justin Bieber,Harry Styles,Shawn Mendes,Sam Smith,Charlie Puth,Niall Horan,Zayn,Bruno Mars,The Weeknd,Justin Timberlake,George Michael,Elton John,Michael Jackson,Elvis Presley,John Legend,Usher,Ne-Yo,Jason Derulo,Adam Levine,Maroon 5,One Direction,NSYNC,Backstreet Boys,Jonas Brothers,OneRepublic,Coldplay,Imagine Dragons,Lewis Capaldi,Hozier,James Blunt,John Mayer,Jason Mraz,Enrique Iglesias,Ricky Martin,Luis Fonsi,Pitbull,Pharrell,Akon,Michael Bublé,Josh Groban", "male", "western", "pop", "US");

// WESTERN ROCK
addMany("Freddie Mercury,Queen,Axl Rose,Guns N' Roses,Kurt Cobain,Nirvana,Chris Cornell,Eddie Vedder,Pearl Jam,Chester Bennington,Linkin Park,Dave Grohl,Foo Fighters,Anthony Kiedis,Red Hot Chili Peppers,Steven Tyler,Aerosmith,Mick Jagger,The Rolling Stones,Robert Plant,Led Zeppelin,Ozzy Osbourne,Black Sabbath,James Hetfield,Metallica,Bruce Dickinson,Iron Maiden,Billie Joe Armstrong,Green Day,Gerard Way,My Chemical Romance,Patrick Stump,Fall Out Boy,Brendon Urie,Panic! At The Disco,Thom Yorke,Radiohead,Matt Bellamy,Muse,Alex Turner,Arctic Monkeys,David Bowie,Lenny Kravitz,The Beatles,Paul McCartney,John Lennon,Corey Taylor,Slipknot,Jonathan Davis,Korn,Serj Tankian,System Of A Down,Maynard James Keenan,Tool,Trent Reznor,Nine Inch Nails,David Draiman,Disturbed,M Shadows,Avenged Sevenfold", "male", "western", "rock", "US");
addMany("Hayley Williams,Paramore,Florence Welch,Stevie Nicks,Fleetwood Mac,Janis Joplin,Debbie Harry,Blondie,Pat Benatar,Alanis Morissette,Avril Lavigne,P!nk,Ann Wilson,Heart", "female", "western", "rock", "US");

// WESTERN RAP
addMany("Eminem,Kendrick Lamar,Drake,J Cole,Jay-Z,Nas,Kanye West,Snoop Dogg,50 Cent,Lil Wayne,Travis Scott,Future,21 Savage,Lil Baby,Young Thug,The Notorious B.I.G.,Tupac,Logic,Mac Miller,Juice WRLD,Childish Gambino,Tyler the Creator,Akon,Pharrell,Will Smith,Post Malone", "male", "western", "rap", "US");
addMany("Nicki Minaj,Cardi B,Megan Thee Stallion,Doja Cat,Ice Spice,Latto,Missy Elliott,Lil' Kim,Queen Latifah", "female", "western", "rap", "US");

// RUSSIAN ROCK
addMany("Би-2,Виктор Цой,Юрий Шевчук,Борис Гребенщиков,Константин Кинчев,Валерий Кипелов,Михаил Горшенёв,Илья Лагутенко,Александр Васильев,Вячеслав Бутусов,Глеб Самойлов,Владимир Шахрин,Звери,Сплин,Мумий Тролль,ДДТ,Кино,Аквариум,Алиса,Ария,Король и Шут,Пикник,Наутилус Помпилиус,Агата Кристи,Чайф,Любэ,Браво,Гарик Сукачёв,Егор Летов", "male", "russian", "rock", "RU");
addMany("Земфира,Диана Арбенина,Ночные Снайперы,Светлана Сурганова,Жанна Агузарова,Юлия Санина,The Hardkiss", "female", "russian", "rock", "RU");

// RUSSIAN POP
addMany("Дима Билан,Сергей Лазарев,Григорий Лепс,Валерий Меладзе,Филипп Киркоров,Николай Басков,Стас Михайлов,Юрий Шатунов,Валерий Леонтьев,Игорь Николаев,Лев Лещенко,Иосиф Кобзон,Муслим Магомаев,Юрий Антонов,Александр Малинин,Владимир Пресняков,Сергей Жуков,Дискотека Авария,Руки Вверх,Hi-Fi,Город 312,Мот,Jony,Niletto,Иван Дорн,Monatik,Макс Барских,Артём Пивоваров,Потап,Дан Балан,Валерий Сюткин", "male", "russian", "pop", "RU");
addMany("Алла Пугачёва,Валерия,Ёлка,Полина Гагарина,Нюша,Алсу,Зара,Ани Лорак,LOBODA,Тину Кароль,Оля Полякова,NK,Настя Каменских,Надя Дорофеева,Монеточка,Алёна Швец,Дора,Люся Чеботина,Instasamka,ANNA ASTI,Ханна,Елена Темникова,МакSим,Клава Кока,Мари Краймбрери,Zivert,Ольга Бузова,Глюкоза,Наташа Королёва,Татьяна Буланова,Алёна Апина,Лариса Долина,Тамара Гвердцители,Кристина Орбакайте,Жасмин,Анжелика Варум,София Ротару,Лайма Вайкуле,Ирина Аллегрова,Жанна Фриске,Вера Брежнева,Анна Седокова,Сати Казанова,IOWA,Света,Юта,Ирина Билык,ВИА Гра,Блестящие,Фабрика,Серебро,Ранетки", "female", "russian", "pop", "RU");

// RUSSIAN RAP
addMany("Oxxxymiron,Баста,Guf,Скриптонит,Моргенштерн,Noize MC,Тимати,Егор Крид,Джиган,Face,Хаски,Олег ЛСП,Каста,Птаха,L'One,ST,T-Fest,Слава КПСС,Big Baby Tape,Элджей,Feduk,Jah Khalib,Miyagi,Эндшпиль,Мот", "male", "russian", "rap", "RU");
addMany("Instasamka,Клава Кока", "female", "russian", "rap", "RU");

// ASIAN K-POP
addMany("IU,Solar,Wheein,Hwasa,Moonbyul,Chaewon,Sakura,Yunjin,Kazuha,Eunchae,Karina,Giselle,Winter,Ningning,Yeji,Lia,Ryujin,Chaeryeong,Yuna,Nayeon,Jeongyeon,Momo,Sana,Jihyo,Mina,Dahyun,Chaeyoung,Tzuyu,Wendy,Irene,Seulgi,Joy,Yeri,Taeyeon,Tiffany,Yoona,Seohyun,BoA,Lee Hi,Heize,Chung Ha,Sunmi,HyunA,Ailee,Jennie,Lisa,Jisoo,Rosé,CL,Soyeon,Miyeon,Minnie,Yuqi,Wonyoung,An Yujin,Minji,Hanni,Danielle,Haerin,Hyein,Ado,LiSA,Aimer,Aimyon,Hikaru Utada,Namie Amuro,Ayumi Hamasaki,Koda Kumi,Perfume,BABYMETAL", "female", "asian", "kpop", "KR");
addMany("Jung Kook,Jimin,V,RM,Suga,J-Hope,Jin,Baekhyun,Chanyeol,Kai,D.O.,Chen,Taemin,G-Dragon,T.O.P,Daesung,Taeyang,PSY,Rain,Zico,Jay Park,Crush,Dean,Tablo,Jackson Wang,Bang Chan,Hyunjin,Felix,Jungwon,Heeseung,San,Hongjoong,Taeyong,Mark,BTS,EXO,Stray Kids,ENHYPEN,ATEEZ,NCT,SEVENTEEN,TXT,GOT7,Monsta X,SHINee,TVXQ,BigBang,Hyde,Gackt,Miyavi,Yoshiki,Kenshi Yonezu,Fujii Kaze,Gen Hoshino,Vaundy,Eve,King Gnu,Official Hige Dandism,Taka,AKMU,Day6,CNBLUE,The Rose", "male", "asian", "kpop", "KR");

const outPath = path.join(__dirname, "..", "lib", "data", "artist-catalog.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ version: 4, count: catalog.length, artists: catalog }));
const byRegion = { western: 0, russian: 0, asian: 0 };
const byGenre = { pop: 0, rock: 0, rap: 0, kpop: 0 };
for (const a of catalog) {
  byRegion[a.region] = (byRegion[a.region] || 0) + 1;
  byGenre[a.genre] = (byGenre[a.genre] || 0) + 1;
}
console.log("wrote", catalog.length, "famous artists ->", outPath);
console.log("by region", byRegion);
console.log("by genre", byGenre);

