const TURN_MS = 30_000;
const MAX_GUESSES = 6;
const WORDS = {
  4: [
    'masa', 'kedi', 'kale', 'sarı', 'evet', 'para', 'okul', 'hava', 'kalp', 'elma',
    'kapı', 'saat', 'dert', 'gece', 'renk', 'köşe', 'dost', 'kötü', 'yeni', 'eski',
    'açık', 'mavi', 'ödev', 'ders', 'film', 'oyun', 'aile', 'anne', 'baba', 'isim',
    'kutu', 'kafa', 'ayak', 'ince', 'ufak', 'uzun', 'kısa', 'sert', 'aynı', 'tane',
    'adet', 'yazı', 'kira', 'ucuz', 'paha', 'borç', 'kart', 'orta', 'özel', 'araç',
    'evde', 'evim', 'sonu', 'yine', 'biri', 'daha'
  ],
  5: [
    'kalem', 'kitap', 'deniz', 'çiçek', 'üzgün', 'güzel', 'araba', 'dünya', 'insan', 'çocuk',
    'kadın', 'erkek', 'şehir', 'hafta', 'sabah', 'akşam', 'bugün', 'yarın', 'güneş', 'meyve',
    'bulut', 'şarkı', 'müzik', 'yemek', 'ekmek', 'kahve', 'tatlı', 'armut', 'kiraz', 'limon',
    'biber', 'soğan', 'sokak', 'cadde', 'sahil', 'orman', 'bahçe', 'çimen', 'çanta', 'ekran',
    'mesaj', 'cevap', 'fikir', 'zaman', 'hayat', 'sevgi', 'kavga', 'mutlu', 'hasta', 'sıcak',
    'soğuk', 'küçük', 'büyük', 'beyaz', 'siyah', 'hızlı', 'yavaş', 'doğru', 'temiz', 'rahat',
    'kolay', 'yakın', 'geniş', 'güçlü', 'canlı', 'yaşlı', 'yarım', 'başka', 'bütün', 'kadar',
    'çünkü', 'belki', 'hemen', 'düşün', 'güven', 'kendi', 'hepsi', 'seçim', 'işler', 'buluş',
    'şimdi', 'sonra', 'hangi', 'neden', 'böyle', 'şöyle', 'sabır', 'sevda', 'tatil', 'bilet',
    'banka', 'hesap', 'dolap', 'duvar', 'tavan', 'tabak', 'bıçak', 'kaşık', 'perde'
  ],
  6: [
    'bardak', 'bayrak', 'kaptan', 'fındık', 'ananas', 'mevsim', 'toprak', 'bakkal', 'zeytin', 'balkon',
    'mutfak', 'merkez', 'yanlış', 'önemli', 'ülkede', 'bahçem', 'şurada', 'burada', 'dışarı', 'kaleci',
    'futbol', 'doktor', 'okulda', 'evinde', 'sağlık', 'geçmiş', 'gazete', 'hikâye', 'eğitim', 'kazanç',
    'başarı', 'gerçek', 'toplum', 'devlet', 'millet', 'başkan', 'miktar', 'derece', 'rüzgar', 'hayvan',
    'tavşan', 'trafik', 'karpuz', 'insanı', 'günlük', 'çantam', 'kapıya', 'yarına', 'kışlık', 'gözlük',
    'bahane', 'yağmur', 'koltuk', 'defter', 'yorgun', 'sessiz', 'akıllı', 'renkli', 'sürücü', 'dolmuş',
    'otobüs', 'çekici', 'yardım', 'sorunu', 'konusu', 'varlık', 'kuralı', 'aralık', 'üretim', 'durumu',
    'kişiye', 'parası', 'işleri', 'gözler', 'elleri', 'sözlük', 'makine', 'kamera', 'resmen', 'sistem',
    'bölümü', 'zengin'
  ]
};

function normalizeWord(value) {
  return value.toLocaleUpperCase('tr-TR');
}

function getInitialState(wordLength = 5, keepScores = false, previous, startingPlayer = 'player1') {
  const answers = WORDS[wordLength] || WORDS[5];
  const answer = normalizeWord(answers[Math.floor(Math.random() * answers.length)]);
  return {
    gameId: 'lingo',
    wordLength,
    answer,
    guesses: [],
    currentTurn: startingPlayer,
    startingPlayer,
    turnDeadline: Date.now() + TURN_MS,
    winner: null,
    player1: keepScores && previous ? previous.player1 : null,
    player2: keepScores && previous ? previous.player2 : null,
    score1: keepScores && previous ? (previous.score1 || 0) : 0,
    score2: keepScores && previous ? (previous.score2 || 0) : 0
  };
}

function publicState(game) {
  const { answer, ...state } = game;
  return { ...state, answer: game.winner ? answer : null };
}

function advanceTurn(game, timedOut = false, now = Date.now()) {
  if (!game || game.gameId !== 'lingo' || game.winner) return false;
  if (timedOut) game.guesses.push({ player: game.currentTurn, guess: '', feedback: [], timedOut: true });
  if (game.guesses.length >= MAX_GUESSES) {
    game.winner = 'draw';
    game.turnDeadline = null;
  } else {
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
    game.turnDeadline = now + TURN_MS;
  }
  return true;
}

function submitGuess(game, socketId, rawGuess, now = Date.now()) {
  if (!game || game.gameId !== 'lingo' || game.winner || game.turnDeadline <= now ||
      typeof rawGuess !== 'string') return false;
  const currentPlayerId = game.currentTurn === 'player1' ? game.player1 : game.player2;
  if (currentPlayerId !== socketId) return false;

  const guess = normalizeWord(rawGuess.trim());
  if ([...guess].length !== game.wordLength || !/^[A-ZÇĞİÖŞÜ]+$/u.test(guess)) return false;

  const answerLetters = [...game.answer];
  const guessLetters = [...guess];
  const feedback = Array(game.wordLength).fill('absent');
  const remaining = new Map();

  answerLetters.forEach((letter, index) => {
    if (guessLetters[index] === letter) feedback[index] = 'correct';
    else remaining.set(letter, (remaining.get(letter) || 0) + 1);
  });
  guessLetters.forEach((letter, index) => {
    if (feedback[index] === 'correct') return;
    const count = remaining.get(letter) || 0;
    if (count > 0) {
      feedback[index] = 'present';
      remaining.set(letter, count - 1);
    }
  });

  game.guesses.push({ player: game.currentTurn, guess, feedback, timedOut: false });
  if (guess === game.answer) {
    game.winner = game.currentTurn;
    game[game.currentTurn === 'player1' ? 'score1' : 'score2'] += 1;
    game.turnDeadline = null;
  } else if (game.guesses.length >= MAX_GUESSES) {
    game.winner = 'draw';
    game.turnDeadline = null;
  } else {
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
    game.turnDeadline = now + TURN_MS;
  }
  return true;
}

module.exports = { TURN_MS, advanceTurn, getInitialState, normalizeWord, publicState, submitGuess };
