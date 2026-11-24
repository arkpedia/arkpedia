/**
 * The tips, by the tier they belong to and by what the board has become.
 *
 * kukki's words, kept verbatim. They are the voice of the guide and not something to
 * tighten. Each shows until the player marks an operator, because a tip is advice about
 * a decision and the mark IS the decision: having acted on it, they do not need it a
 * second time.
 */
export const TIER_TIPS: Record<string, string> = {
  I: 'Right now, you do not have to commit to any core alliances. However, you can aim early for Swift, Agile, Raid (40/50 stacks can buff all operators), and Aid (gives stacks to all active alliances later). Click on the four add-on alliances above to see who you can get. From Round 1 to 5, there are no bad choices, freely choose anyone, but having more operators to use up the deployment limit helps to win more. Do not go for triple copies (promote) until Dispatch Level 3. Get out of Dispatch Level 1 as fast as possible. Ideally by Round 2, which you can upgrade the Dispatch Level and buy an item. Leaking is okay, even when in co-op, think of leaks as leaking early to become stronger for later (hopefully).',
  II: 'You still do not have to commit to any core alliances. Thumbs Up operators are good at stacking their specific alliances. You can get them to lean into core or add-on alliances, but again, you are not locking yourself to any alliances yet. Get out of Dispatch Level 2 as fast as possible as you want to access better alliance stackers quicker.',
  III: 'You may try for triple copies (promote) now. From Dispatch Level 3 to 4, you need to hunt for Star operators. These are \'Committed\' operators that makes you play into the core alliance. As long as you receive one, you can fully send it into playing that core alliance. Greyed out operators are not recommended to obtain until you have found the \'Committed\' operators that synergizes with them via the alliances.',
  IV: 'You need to aggressively hunt for \'Committed\' operators (the Star operators). If you are in co-op mode, please pay attention to your teammates team\'s that they\'re committing towards so as to not play the same alliance as them. Operator pools are shared in this game mode.',
};

/** What the board itself says, which outranks the tier's standing advice. */
export const STATE_TIPS: Record<string, string> = {
  'star-1': 'You can now play into this core alliance. You may still pick another \'Committed\' operator if you want to make a sudden switch. Once you have found 3 operators, you can lock down this alliance.',
  'star-2': 'You have 2 \'Committed\' operators, please remove/sell one to decide on which core you want to play.',
  locked: 'This core alliance has been locked down successfully. Happy hunting for the full team!',
  unlocked: 'This core alliance has not been locked down yet, you need to get the \'Committed\' operator to truly sink in. Else you may need to make a sudden switch now by finding another \'Committed operator of a different core alliance.',
};

/** Every language the tip system can be read in, in the order the picker
 *  lists them -- English first (the source language), then the requested
 *  set. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'th', name: 'ไทย' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Malaysia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'pt', name: 'Português' },
];

/**
 * Translations for the tip set keyed the same way tipNow already keys tips:
 * tier-I..tier-IV for the per-band orientation tips, star-1/star-2/locked/
 * unlocked for the reactive ones. Deliberately the shorter, more universal
 * tips only -- CORE_TIPS (the eight long per-alliance strategy tips) and the
 * Isomorph reminder are not translated yet, and tipText's fallback below
 * quietly reads English for any key a language does not have, rather than
 * showing nothing.
 *
 * Game-specific terms (alliance names, Dispatch, Star, Committed) are kept
 * in English within each translated sentence. This tool has no verified
 * source for how the game itself localizes those terms in each of these
 * languages, and guessing wrong would read as a DIFFERENT mechanic than the
 * one on the player's own screen -- worse than leaving the term as the word
 * they already recognise from the game.
 */
const TIP_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    'tier-III': 'Теперь можно пробовать тройные копии (повышение). С 3 по 4 уровень Dispatch нужно охотиться за «звёздными» операторами (Star). Это «Committed»-операторы, которые заставляют вас играть за основной альянс. Получив хотя бы одного, можно полностью посвятить себя этому альянсу. Затемнённых операторов не рекомендуется брать, пока вы не нашли «Committed»-операторов, которые с ними сочетаются через альянсы.',
    'tier-IV': 'Нужно активно охотиться за «Committed»-операторами (звёздными). Если вы играете в кооперативе, следите, к чему стремятся ваши товарищи по команде, чтобы не играть за один и тот же альянс. Пул операторов в этом режиме общий.',
    'star-1': 'Теперь вы можете играть за этот основной альянс. Вы всё ещё можете выбрать другого «Committed»-оператора, если захотите резко сменить направление. Набрав 3 операторов, вы сможете закрепить этот альянс.',
    'star-2': 'У вас 2 «Committed»-оператора — уберите/продайте одного, чтобы определиться, за какой core вы играете.',
    locked: 'Этот основной альянс успешно закреплён. Удачной охоты за оставшейся командой!',
    unlocked: 'Этот основной альянс ещё не закреплён — нужен «Committed»-оператор, чтобы окончательно определиться. Иначе может понадобиться резко сменить направление, найдя «Committed»-оператора другого основного альянса.',
  },
  fr: {
    'tier-III': 'Vous pouvez maintenant tenter les triples exemplaires (promotion). Du niveau 3 à 4 de Dispatch, il faut chasser les opérateurs Étoile (Star). Ce sont des opérateurs «\u00a0Engagés\u00a0» (Committed) qui vous font jouer l\u2019alliance principale. Dès que vous en obtenez un, vous pouvez pleinement vous engager dans cette alliance. Les opérateurs grisés ne sont pas recommandés tant que vous n\u2019avez pas trouvé les opérateurs «\u00a0Engagés\u00a0» qui se synergisent avec eux via les alliances.',
    'tier-IV': 'Vous devez chasser activement les opérateurs «\u00a0Engagés\u00a0» (les opérateurs Étoile). En coopératif, faites attention à l\u2019alliance vers laquelle vos coéquipiers s\u2019engagent, pour ne pas jouer la même. Les pools d\u2019opérateurs sont partagés dans ce mode.',
    'star-1': 'Vous pouvez maintenant jouer cette alliance principale. Vous pouvez encore choisir un autre opérateur «\u00a0Engagé\u00a0» pour changer brusquement de direction. Une fois 3 opérateurs obtenus, vous pouvez verrouiller cette alliance.',
    'star-2': 'Vous avez 2 opérateurs «\u00a0Engagés\u00a0»\u00a0: retirez/vendez-en un pour décider quelle alliance principale vous jouez.',
    locked: 'Cette alliance principale est verrouillée avec succès. Bonne chasse pour compléter l\u2019équipe\u00a0!',
    unlocked: 'Cette alliance principale n\u2019est pas encore verrouillée\u00a0: il vous faut un opérateur «\u00a0Engagé\u00a0» pour vraiment vous fixer. Sinon, vous devrez peut-être changer brusquement de direction en trouvant un opérateur «\u00a0Engagé\u00a0» d\u2019une autre alliance principale.',
  },
  de: {
    'tier-III': 'Jetzt kannst du dreifache Kopien (Beförderung) versuchen. Von Dispatch-Stufe 3 auf 4 musst du nach Stern-Operators (Star) jagen. Das sind „Committed“-Operators, die dich dazu bringen, die Hauptallianz zu spielen. Sobald du einen erhältst, kannst du dich voll auf diese Allianz festlegen. Ausgegraute Operators werden nicht empfohlen, bis du die „Committed“-Operators gefunden hast, die über die Allianzen mit ihnen zusammenwirken.',
    'tier-IV': 'Du musst aggressiv nach „Committed“-Operators (den Stern-Operators) jagen. Achte im Koop-Modus darauf, worauf sich deine Mitspieler festlegen, um nicht dieselbe Allianz zu spielen. Die Operator-Pools werden in diesem Modus geteilt.',
    'star-1': 'Du kannst jetzt diese Hauptallianz spielen. Du kannst noch einen weiteren „Committed“-Operator wählen, falls du plötzlich wechseln willst. Sobald du 3 Operators hast, kannst du diese Allianz festschreiben.',
    'star-2': 'Du hast 2 „Committed“-Operators — entferne/verkaufe einen, um zu entscheiden, welche Hauptallianz du spielst.',
    locked: 'Diese Hauptallianz wurde erfolgreich festgeschrieben. Viel Erfolg bei der Jagd nach dem restlichen Team!',
    unlocked: 'Diese Hauptallianz ist noch nicht festgeschrieben — du brauchst den „Committed“-Operator, um dich wirklich festzulegen. Sonst musst du vielleicht plötzlich wechseln, indem du einen „Committed“-Operator einer anderen Hauptallianz findest.',
  },
  es: {
    'tier-III': 'Ahora puedes intentar triples copias (ascenso). Del nivel 3 al 4 de Dispatch necesitas cazar operadores Estrella (Star). Son operadores «Comprometidos» (Committed) que te hacen jugar la alianza principal. En cuanto consigas uno, puedes volcarte por completo en esa alianza. No se recomienda obtener operadores en gris hasta que hayas encontrado los operadores «Comprometidos» que sinergizan con ellos mediante las alianzas.',
    'tier-IV': 'Debes cazar agresivamente operadores «Comprometidos» (los operadores Estrella). En modo cooperativo, presta atención a hacia qué alianza se están comprometiendo tus compañeros para no jugar la misma. Los pools de operadores se comparten en este modo de juego.',
    'star-1': 'Ahora puedes jugar esta alianza principal. Aún puedes elegir otro operador «Comprometido» si quieres cambiar de repente. Una vez que consigas 3 operadores, puedes cerrar esta alianza.',
    'star-2': 'Tienes 2 operadores «Comprometidos»; quita/vende uno para decidir con qué alianza principal vas a jugar.',
    locked: 'Esta alianza principal quedó cerrada con éxito. ¡Buena caza para completar el equipo!',
    unlocked: 'Esta alianza principal aún no está cerrada; necesitas al operador «Comprometido» para asentarte de verdad. Si no, puede que debas cambiar de repente encontrando un operador «Comprometido» de otra alianza principal.',
  },
  th: {
    'tier-III': 'ตอนนี้คุณลองไล่ล่าสามชุด (เลื่อนขั้น) ได้แล้ว ตั้งแต่ Dispatch ระดับ 3 ถึง 4 คุณต้องล่าโอเปอเรเตอร์ดาว (Star) ซึ่งเป็นโอเปอเรเตอร์ "Committed" ที่ทำให้คุณเล่นพันธมิตรหลักนั้นจริงจัง เมื่อได้มาหนึ่งตัวแล้ว คุณสามารถทุ่มเทให้กับพันธมิตรนั้นได้เต็มที่ โอเปอเรเตอร์ที่เป็นสีเทาไม่แนะนำให้ได้มาจนกว่าจะพบโอเปอเรเตอร์ "Committed" ที่เข้ากันได้ผ่านพันธมิตร',
    'tier-IV': 'คุณต้องไล่ล่าโอเปอเรเตอร์ "Committed" (โอเปอเรเตอร์ดาว) อย่างจริงจัง หากเล่นโหมดร่วมมือ โปรดสังเกตว่าเพื่อนร่วมทีมกำลังผูกมัดกับพันธมิตรใด เพื่อจะได้ไม่เล่นพันธมิตรเดียวกัน พูลโอเปอเรเตอร์ถูกใช้ร่วมกันในโหมดนี้',
    'star-1': 'ตอนนี้คุณสามารถเล่นพันธมิตรหลักนี้ได้แล้ว คุณยังสามารถเลือกโอเปอเรเตอร์ "Committed" ตัวอื่นได้หากต้องการเปลี่ยนทิศทางกะทันหัน เมื่อได้โอเปอเรเตอร์ครบ 3 ตัวแล้ว คุณสามารถล็อกพันธมิตรนี้ได้',
    'star-2': 'คุณมีโอเปอเรเตอร์ "Committed" 2 ตัว โปรดถอด/ขายตัวหนึ่งออกเพื่อตัดสินใจว่าจะเล่นพันธมิตรหลักใด',
    locked: 'พันธมิตรหลักนี้ถูกล็อกสำเร็จแล้ว ขอให้ล่าทีมที่เหลือให้สนุก!',
    unlocked: 'พันธมิตรหลักนี้ยังไม่ถูกล็อก คุณต้องได้โอเปอเรเตอร์ "Committed" เพื่อให้แน่วแน่จริงๆ ไม่เช่นนั้นอาจต้องเปลี่ยนทิศทางกะทันหันโดยหาโอเปอเรเตอร์ "Committed" ของพันธมิตรหลักอื่น',
  },
  ja: {
    'tier-III': 'ここからは3凸（昇進）を狙っても構いません。Dispatchレベル3から4の間は「スター」オペレーターを探す必要があります。これはコア陣営を本格的にプレイさせる『Committed』オペレーターです。1体でも手に入れば、その陣営に全力を注げます。灰色表示のオペレーターは、陣営を通じて相乗効果のある『Committed』オペレーターを見つけるまでは、入手を推奨しません。',
    'tier-IV': '『Committed』オペレーター（スターオペレーター）を積極的に狙う必要があります。協力プレイの場合は、チームメイトがどの陣営にコミットしているか確認し、同じ陣営にならないよう注意してください。このモードではオペレータープールは共有されます。',
    'star-1': 'このコア陣営をプレイできるようになりました。急な方向転換をしたい場合は、別の『Committed』オペレーターを選ぶこともできます。3体揃えば、この陣営を確定できます。',
    'star-2': '『Committed』オペレーターが2体います。どちらのコア陣営でプレイするか決めるため、片方を外す/売却してください。',
    locked: 'このコア陣営の確定に成功しました。残りのチームを楽しく探しましょう！',
    unlocked: 'このコア陣営はまだ確定していません。本当に定着させるには『Committed』オペレーターが必要です。さもないと、別のコア陣営の『Committed』オペレーターを見つけて急遽方向転換する必要があるかもしれません。',
  },
  ko: {
    'tier-III': '이제 3중 카피(승급)를 시도해도 됩니다. Dispatch 레벨 3에서 4까지는 스타(Star) 오퍼레이터를 찾아야 합니다. 이들은 코어 진영을 실제로 플레이하게 만드는 \'Committed\' 오퍼레이터입니다. 한 명이라도 얻으면 그 코어 진영에 완전히 전념할 수 있습니다. 회색으로 표시된 오퍼레이터는 진영을 통해 시너지를 내는 \'Committed\' 오퍼레이터를 찾기 전까지는 획득을 권장하지 않습니다.',
    'tier-IV': '\'Committed\' 오퍼레이터(스타 오퍼레이터)를 적극적으로 찾아야 합니다. 협동 모드라면 같은 진영을 플레이하지 않도록 팀원들이 어떤 진영에 커밋하고 있는지 주의 깊게 살펴보세요. 이 모드에서는 오퍼레이터 풀이 공유됩니다.',
    'star-1': '이제 이 코어 진영을 플레이할 수 있습니다. 갑자기 방향을 바꾸고 싶다면 다른 \'Committed\' 오퍼레이터를 선택할 수도 있습니다. 오퍼레이터 3명을 확보하면 이 진영을 확정할 수 있습니다.',
    'star-2': '\'Committed\' 오퍼레이터가 2명 있습니다. 어느 코어 진영을 플레이할지 결정하기 위해 한 명을 제거/판매하세요.',
    locked: '이 코어 진영이 성공적으로 확정되었습니다. 남은 팀원을 즐겁게 찾아보세요!',
    unlocked: '이 코어 진영은 아직 확정되지 않았습니다. 진짜로 정착하려면 \'Committed\' 오퍼레이터가 필요합니다. 그렇지 않으면 다른 코어 진영의 \'Committed\' 오퍼레이터를 찾아 갑자기 방향을 바꿔야 할 수도 있습니다.',
  },
  zh: {
    'tier-III': '现在可以尝试三凸（精英化）了。从 Dispatch 3 级到 4 级，你需要寻找星标（Star）干员，也就是能让你真正投入核心阵营的『Committed』干员。只要获得一个，就可以完全投入该阵营。在你找到通过阵营与其产生联动的『Committed』干员之前，不建议获取灰色显示的干员。',
    'tier-IV': '你需要积极寻找『Committed』干员（星标干员）。如果是合作模式，请留意队友正在投入哪个阵营，以免与他们重复。此模式下干员池是共享的。',
    'star-1': '现在你可以投入这个核心阵营了。如果想临时改变方向，仍然可以选择另一个『Committed』干员。一旦凑齐 3 名干员，就可以锁定这个阵营。',
    'star-2': '你有 2 名『Committed』干员，请移除/出售一个，以决定要玩哪个核心阵营。',
    locked: '这个核心阵营已成功锁定。祝你顺利凑齐剩余队伍！',
    unlocked: '这个核心阵营尚未锁定，你需要一名『Committed』干员才能真正确定下来。否则可能需要通过找到另一个核心阵营的『Committed』干员来临时改变方向。',
  },
  id: {
    'tier-III': 'Sekarang kamu bisa mencoba triple copy (promosi). Dari Dispatch level 3 ke 4, kamu perlu memburu operator Bintang (Star). Ini adalah operator \'Committed\' yang membuatmu benar-benar memainkan aliansi inti. Begitu kamu mendapat satu, kamu bisa sepenuhnya fokus ke aliansi tersebut. Operator yang berwarna abu-abu tidak disarankan untuk didapatkan sampai kamu menemukan operator \'Committed\' yang bersinergi dengan mereka lewat aliansi.',
    'tier-IV': 'Kamu perlu berburu operator \'Committed\' (operator Bintang) secara agresif. Jika bermain mode co-op, perhatikan aliansi mana yang sedang dikomit oleh rekan timmu agar tidak memainkan aliansi yang sama. Pool operator dibagikan bersama dalam mode ini.',
    'star-1': 'Sekarang kamu bisa memainkan aliansi inti ini. Kamu masih bisa memilih operator \'Committed\' lain jika ingin berpindah arah secara mendadak. Setelah mendapat 3 operator, kamu bisa mengunci aliansi ini.',
    'star-2': 'Kamu punya 2 operator \'Committed\', silakan lepas/jual salah satu untuk memutuskan aliansi inti mana yang ingin dimainkan.',
    locked: 'Aliansi inti ini berhasil dikunci. Selamat berburu untuk melengkapi timmu!',
    unlocked: 'Aliansi inti ini belum terkunci, kamu perlu operator \'Committed\' untuk benar-benar memantapkannya. Jika tidak, kamu mungkin perlu berpindah arah secara mendadak dengan mencari operator \'Committed\' dari aliansi inti lain.',
  },
  ms: {
    'tier-III': 'Sekarang anda boleh cuba salinan tiga (promosi). Dari Dispatch tahap 3 ke 4, anda perlu memburu operator Bintang (Star). Ini ialah operator \'Committed\' yang menjadikan anda benar-benar bermain gabungan teras itu. Sebaik sahaja anda dapat seorang, anda boleh menumpukan sepenuhnya kepada gabungan tersebut. Operator berwarna kelabu tidak disyorkan untuk didapatkan sehingga anda menemui operator \'Committed\' yang bersinergi dengan mereka melalui gabungan.',
    'tier-IV': 'Anda perlu memburu operator \'Committed\' (operator Bintang) secara agresif. Jika bermain mod kerjasama, perhatikan gabungan mana rakan sepasukan anda sedang komited supaya tidak bermain gabungan yang sama. Kumpulan operator dikongsi bersama dalam mod ini.',
    'star-1': 'Sekarang anda boleh bermain gabungan teras ini. Anda masih boleh pilih operator \'Committed\' lain jika mahu bertukar arah secara mendadak. Sebaik sahaja mendapat 3 operator, anda boleh kunci gabungan ini.',
    'star-2': 'Anda mempunyai 2 operator \'Committed\', sila buang/jual seorang untuk memutuskan gabungan teras mana yang anda mahu mainkan.',
    locked: 'Gabungan teras ini berjaya dikunci. Selamat memburu untuk melengkapkan pasukan anda!',
    unlocked: 'Gabungan teras ini belum dikunci — anda perlukan operator \'Committed\' untuk benar-benar mengukuhkannya. Jika tidak, anda mungkin perlu bertukar arah secara mendadak dengan mencari operator \'Committed\' daripada gabungan teras lain.',
  },
  vi: {
    'tier-III': 'Giờ bạn có thể thử bản sao thứ ba (thăng cấp). Từ Dispatch cấp 3 đến 4, bạn cần săn operator Sao (Star). Đây là các operator \'Committed\' khiến bạn thực sự chơi liên minh cốt lõi đó. Chỉ cần có một, bạn có thể dồn toàn lực vào liên minh đó. Không nên lấy các operator bị làm mờ cho đến khi bạn tìm được operator \'Committed\' cộng hưởng với họ qua các liên minh.',
    'tier-IV': 'Bạn cần tích cực săn các operator \'Committed\' (operator Sao). Nếu chơi chế độ hợp tác, hãy chú ý xem đồng đội đang cam kết liên minh nào để tránh trùng. Nguồn operator được chia sẻ trong chế độ này.',
    'star-1': 'Giờ bạn có thể chơi liên minh cốt lõi này. Bạn vẫn có thể chọn một operator \'Committed\' khác nếu muốn đột ngột đổi hướng. Khi có đủ 3 operator, bạn có thể khóa liên minh này.',
    'star-2': 'Bạn có 2 operator \'Committed\', hãy gỡ/bán bớt một để quyết định sẽ chơi liên minh cốt lõi nào.',
    locked: 'Liên minh cốt lõi này đã được khóa thành công. Chúc săn tốt phần đội hình còn lại!',
    unlocked: 'Liên minh cốt lõi này chưa được khóa — bạn cần operator \'Committed\' để thực sự ổn định. Nếu không, bạn có thể phải đột ngột đổi hướng bằng cách tìm operator \'Committed\' của một liên minh cốt lõi khác.',
  },
  pt: {
    'tier-III': 'Agora você pode tentar triplicatas (promoção). Do nível 3 ao 4 de Dispatch, você precisa caçar operadores Estrela (Star). Estes são operadores \'Comprometidos\' (Committed) que fazem você realmente jogar a aliança principal. Assim que conseguir um, pode se dedicar totalmente a essa aliança. Operadores acinzentados não são recomendados até você encontrar os operadores \'Comprometidos\' que sinergizam com eles através das alianças.',
    'tier-IV': 'Você precisa caçar agressivamente operadores \'Comprometidos\' (os operadores Estrela). No modo cooperativo, preste atenção em qual aliança seus companheiros de equipe estão se comprometendo, para não jogar a mesma. Os pools de operadores são compartilhados neste modo.',
    'star-1': 'Agora você pode jogar esta aliança principal. Ainda pode escolher outro operador \'Comprometido\' se quiser mudar de direção repentinamente. Assim que conseguir 3 operadores, pode travar esta aliança.',
    'star-2': 'Você tem 2 operadores \'Comprometidos\'; remova/venda um para decidir com qual aliança principal você vai jogar.',
    locked: 'Esta aliança principal foi travada com sucesso. Boa caçada para completar o time!',
    unlocked: 'Esta aliança principal ainda não foi travada — você precisa do operador \'Comprometido\' para realmente se firmar. Caso contrário, pode precisar mudar de direção repentinamente encontrando um operador \'Comprometido\' de outra aliança principal.',
  },
};

/** English if the language has no entry for this key (or is English itself)
 *  -- CORE_TIPS and the Isomorph reminder currently fall back this way for
 *  every non-English language, since only the shorter tip set above is
 *  translated so far. */
export function tipText(language: string, key: string, fallback: string): string {
  return TIP_TRANSLATIONS[language]?.[key] ?? fallback;
}

/**
 * Translations for the setup wizard's own step instructions -- the three
 * sentences telling the player what each step is for. Same fallback
 * contract as tipText: no entry for a language reads the English original.
 *
 * The bans instruction embeds the Setup button's own name mid-sentence; the
 * literal button label stays as "Setup" in every language (it is what is
 * actually printed on the button) with a {{SETUP}} placeholder marking
 * where it goes, split out and re-inserted in bold at render time.
 */
const SETUP_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    pools: 'Выберите 2 (одиночный режим) или 3 (командный режим) группы врагов, которые встретятся в вашем забеге.',
    bans: 'Выберите альянсы, которые ограничены. Вы можете вернуться сюда во время забега — кнопка {{SETUP}} снова открывает этот шаг.',
    strategy: 'Выберите используемую стратегию.',
  },
  fr: {
    pools: 'Sélectionnez les 2 (simulation solo) ou 3 (simulation en équipe) groupes d\u2019ennemis qui apparaissent dans votre partie.',
    bans: 'Sélectionnez les alliances restreintes. Vous pouvez revenir ici pendant la partie \u2014 le bouton {{SETUP}} rouvre cette étape.',
    strategy: 'Sélectionnez la stratégie que vous utilisez.',
  },
  de: {
    pools: 'Wähle die 2 (Solo-Simulation) oder 3 (Team-Simulation) Feindgruppen, die in deinem Lauf vorkommen.',
    bans: 'Wähle die eingeschränkten Allianzen. Du kannst während des Laufs hierher zurückkehren — der {{SETUP}}-Button öffnet diesen Schritt erneut.',
    strategy: 'Wähle die Strategie, die du verwendest.',
  },
  es: {
    pools: 'Selecciona los 2 (simulación en solitario) o 3 (simulación en equipo) grupos de enemigos que aparecen en tu partida.',
    bans: 'Selecciona las alianzas restringidas. Puedes volver aquí durante la partida: el botón {{SETUP}} reabre este paso.',
    strategy: 'Selecciona la estrategia que estás usando.',
  },
  th: {
    pools: 'เลือกกลุ่มศัตรู 2 กลุ่ม (จำลองเดี่ยว) หรือ 3 กลุ่ม (จำลองทีม) ที่จะปรากฏในรอบของคุณ',
    bans: 'เลือกพันธมิตรที่ถูกจำกัด คุณสามารถกลับมาที่นี่ระหว่างรอบได้ — ปุ่ม {{SETUP}} จะเปิดขั้นตอนนี้อีกครั้ง',
    strategy: 'เลือกกลยุทธ์ที่คุณกำลังใช้',
  },
  ja: {
    pools: 'あなたのランで登場する敵グループを、2つ（ソロシミュレーション）または3つ（チームシミュレーション）選んでください。',
    bans: '制限する陣営を選択してください。ラン中にここへ戻ることもできます —「{{SETUP}}」ボタンでこのステップを再度開けます。',
    strategy: '使用する戦略を選択してください。',
  },
  ko: {
    pools: '런에 등장하는 적 그룹을 2개(솔로 시뮬레이션) 또는 3개(팀 시뮬레이션) 선택하세요.',
    bans: '제한할 진영을 선택하세요. 런 도중에도 다시 돌아올 수 있습니다 — {{SETUP}} 버튼을 누르면 이 단계가 다시 열립니다.',
    strategy: '사용할 전략을 선택하세요.',
  },
  zh: {
    pools: '选择你本局中会出现的 2 个（单人模拟）或 3 个（组队模拟）敌人分组。',
    bans: '选择要限制的阵营。你可以在游戏过程中随时回到这里 —— 点击 {{SETUP}} 按钮即可重新打开此步骤。',
    strategy: '选择你正在使用的策略。',
  },
  id: {
    pools: 'Pilih 2 (simulasi solo) atau 3 (simulasi tim) kelompok musuh yang muncul dalam run kamu.',
    bans: 'Pilih aliansi yang dibatasi. Kamu bisa kembali ke sini selama run berlangsung — tombol {{SETUP}} akan membuka langkah ini lagi.',
    strategy: 'Pilih strategi yang kamu gunakan.',
  },
  ms: {
    pools: 'Pilih 2 (simulasi solo) atau 3 (simulasi berpasukan) kumpulan musuh yang muncul dalam larian anda.',
    bans: 'Pilih gabungan yang dihadkan. Anda boleh kembali ke sini semasa larian — butang {{SETUP}} akan membuka semula langkah ini.',
    strategy: 'Pilih strategi yang anda gunakan.',
  },
  vi: {
    pools: 'Chọn 2 (mô phỏng solo) hoặc 3 (mô phỏng đội) nhóm kẻ địch xuất hiện trong lượt chơi của bạn.',
    bans: 'Chọn các liên minh bị hạn chế. Bạn có thể quay lại đây trong lượt chơi — nút {{SETUP}} sẽ mở lại bước này.',
    strategy: 'Chọn chiến lược bạn đang sử dụng.',
  },
  pt: {
    pools: 'Selecione os 2 (simulação solo) ou 3 (simulação em equipe) grupos de inimigos que aparecem na sua run.',
    bans: 'Selecione as alianças restritas. Você pode voltar aqui durante a run — o botão {{SETUP}} reabre esta etapa.',
    strategy: 'Selecione a estratégia que você está usando.',
  },
};

export function setupText(language: string, key: string, fallback: string): string {
  return SETUP_TRANSLATIONS[language]?.[key] ?? fallback;
}

/**
 * Every visible button label this screen has, outside the tip system --
 * Setup, New Player, Reset, Collapse, the tip controls, the standing
 * preferences, Owned, Recommended/Filler, Return, the run-start button, the
 * Guide toggle, and the onboarding hint's own dismiss button. Tooltips and
 * aria-labels are not covered here -- this is the text actually printed on
 * each button, which is what a reader without English sees first.
 */
const BUTTON_TRANSLATIONS: Record<string, Record<string, string>> = {
  ru: {
    setup: 'Настройка', newPlayer: 'Новичок', reset: 'Сброс', resetSure: 'Точно? Сбросить всё',
    collapse: 'Свернуть', showTip: 'Показать совет', tips: 'Советы', icons: 'Значки',
    descriptions: 'Описания', owned: 'В наличии', recommended: 'Рекомендовано', filler: 'Заполнение',
    return: 'Назад', backToRun: 'К забегу', startRun: 'Начать забег', guide: 'Гайд', gotIt: 'Понятно',
  },
  fr: {
    setup: 'Configuration', newPlayer: 'Nouveau joueur', reset: 'Réinitialiser', resetSure: 'Sûr\u00a0? Tout réinitialiser',
    collapse: 'Réduire', showTip: 'Afficher le conseil', tips: 'Conseils', icons: 'Icônes',
    descriptions: 'Descriptions', owned: 'Possédés', recommended: 'Recommandé', filler: 'Complément',
    return: 'Retour', backToRun: 'Retour à la partie', startRun: 'Démarrer', guide: 'Guide', gotIt: 'Compris',
  },
  de: {
    setup: 'Setup', newPlayer: 'Neuling', reset: 'Zurücksetzen', resetSure: 'Sicher? Alles zurücksetzen',
    collapse: 'Einklappen', showTip: 'Tipp anzeigen', tips: 'Tipps', icons: 'Symbole',
    descriptions: 'Beschreibungen', owned: 'Besitzt', recommended: 'Empfohlen', filler: 'Füllmaterial',
    return: 'Zurück', backToRun: 'Zurück zum Lauf', startRun: 'Lauf starten', guide: 'Anleitung', gotIt: 'Verstanden',
  },
  es: {
    setup: 'Configuración', newPlayer: 'Nuevo jugador', reset: 'Reiniciar', resetSure: '¿Seguro? Reiniciar todo',
    collapse: 'Contraer', showTip: 'Mostrar consejo', tips: 'Consejos', icons: 'Iconos',
    descriptions: 'Descripciones', owned: 'En posesión', recommended: 'Recomendado', filler: 'Relleno',
    return: 'Volver', backToRun: 'Volver a la partida', startRun: 'Iniciar partida', guide: 'Guía', gotIt: 'Entendido',
  },
  th: {
    setup: 'ตั้งค่า', newPlayer: 'ผู้เล่นใหม่', reset: 'รีเซ็ต', resetSure: 'แน่ใจไหม? รีเซ็ตทั้งหมด',
    collapse: 'ย่อ', showTip: 'แสดงเคล็ดลับ', tips: 'เคล็ดลับ', icons: 'ไอคอน',
    descriptions: 'คำอธิบาย', owned: 'ที่มีอยู่', recommended: 'แนะนำ', filler: 'เสริม',
    return: 'กลับ', backToRun: 'กลับสู่รอบ', startRun: 'เริ่มรอบ', guide: 'คู่มือ', gotIt: 'เข้าใจแล้ว',
  },
  ja: {
    setup: 'セットアップ', newPlayer: '初心者向け', reset: 'リセット', resetSure: '本当にすべてリセットしますか？',
    collapse: '折りたたむ', showTip: 'ヒントを表示', tips: 'ヒント', icons: 'アイコン',
    descriptions: '説明', owned: '所持', recommended: 'おすすめ', filler: '補充',
    return: '戻る', backToRun: 'ランに戻る', startRun: 'ラン開始', guide: 'ガイド', gotIt: '了解',
  },
  ko: {
    setup: '설정', newPlayer: '초보자', reset: '초기화', resetSure: '확실합니까? 모두 초기화',
    collapse: '접기', showTip: '팁 보기', tips: '팁', icons: '아이콘',
    descriptions: '설명', owned: '보유', recommended: '추천', filler: '보충',
    return: '뒤로', backToRun: '런으로 돌아가기', startRun: '런 시작', guide: '가이드', gotIt: '확인',
  },
  zh: {
    setup: '设置', newPlayer: '新手', reset: '重置', resetSure: '确定吗？全部重置',
    collapse: '收起', showTip: '显示提示', tips: '提示', icons: '图标',
    descriptions: '描述', owned: '已拥有', recommended: '推荐', filler: '补充',
    return: '返回', backToRun: '返回本局', startRun: '开始本局', guide: '指南', gotIt: '知道了',
  },
  id: {
    setup: 'Pengaturan', newPlayer: 'Pemain Baru', reset: 'Atur Ulang', resetSure: 'Yakin? Atur ulang semua',
    collapse: 'Ciutkan', showTip: 'Tampilkan tip', tips: 'Tip', icons: 'Ikon',
    descriptions: 'Deskripsi', owned: 'Dimiliki', recommended: 'Direkomendasikan', filler: 'Pengisi',
    return: 'Kembali', backToRun: 'Kembali ke run', startRun: 'Mulai run', guide: 'Panduan', gotIt: 'Mengerti',
  },
  ms: {
    setup: 'Persediaan', newPlayer: 'Pemain Baharu', reset: 'Set Semula', resetSure: 'Pasti? Set semula semua',
    collapse: 'Kuncupkan', showTip: 'Tunjuk petua', tips: 'Petua', icons: 'Ikon',
    descriptions: 'Penerangan', owned: 'Dimiliki', recommended: 'Disyorkan', filler: 'Pengisi',
    return: 'Kembali', backToRun: 'Kembali ke larian', startRun: 'Mula larian', guide: 'Panduan', gotIt: 'Faham',
  },
  vi: {
    setup: 'Thiết lập', newPlayer: 'Người mới', reset: 'Đặt lại', resetSure: 'Chắc chắn? Đặt lại tất cả',
    collapse: 'Thu gọn', showTip: 'Hiện mẹo', tips: 'Mẹo', icons: 'Biểu tượng',
    descriptions: 'Mô tả', owned: 'Đã sở hữu', recommended: 'Đề xuất', filler: 'Bổ sung',
    return: 'Quay lại', backToRun: 'Quay lại lượt chơi', startRun: 'Bắt đầu lượt chơi', guide: 'Hướng dẫn', gotIt: 'Đã hiểu',
  },
  pt: {
    setup: 'Configuração', newPlayer: 'Novo Jogador', reset: 'Redefinir', resetSure: 'Tem certeza? Redefinir tudo',
    collapse: 'Recolher', showTip: 'Mostrar dica', tips: 'Dicas', icons: 'Ícones',
    descriptions: 'Descrições', owned: 'Possuídos', recommended: 'Recomendado', filler: 'Complemento',
    return: 'Voltar', backToRun: 'Voltar à run', startRun: 'Iniciar run', guide: 'Guia', gotIt: 'Entendi',
  },
};

export function bt(language: string, key: string, fallback: string): string {
  return BUTTON_TRANSLATIONS[language]?.[key] ?? fallback;
}
