# USED

모바일 우선 중고물품·중고차 검색 PWA. 토스 공개 디자인 원칙을 참고한 독립 UI이며 공식 TDS 패키지나 토스 제휴 서비스가 아닙니다.

## 현재 제공하는 기능

- 중고물품 / 중고차 전환, 키워드 검색, 서비스별 세그먼트
- 카테고리·가격·상품 상태·거래 방법·판매 상태 필터
- 자동차 제조사·최소 연식·최대 주행거리·연료 필터
- 지역명 또는 일회성 브라우저 위치 권한 기반 거리 필터
- 가격·최신·거리 정렬, 기기 내 찜 저장
- 아이폰 홈 화면 아이콘(흰 배경 USED), standalone manifest, 앱 셸 오프라인 캐시
- 당근·중고나라·번개장터·헬로마켓, 엔카·KB차차차·K Car 원문 연결
- 구매·결제·채팅 없음

## 실제 데이터 연결 상태 — 중요

**현재 실제 매물 수집/통합 검색은 연결되지 않았습니다.** 초기 화면은 명시적으로 표시된 샘플 체험이며 `data/demo.json`의 가상 매물 27개(물품 18개, 차량 9개)를 사용합니다. Unsplash 사진은 설명용이며 실제 판매 상품·차량이 아닙니다. `data/listings.json`은 빈 배열입니다. ‘실제 검색’은 실제 데이터 영역과 원문 검색 링크를 보여 줍니다. 모든 웹 매물을 수집한다고 주장하지 않습니다.

번개장터 [공식 파트너센터](https://sell-global.bunjang.co.kr/)와 [API 문서](https://api.bgzt.guide/)는 계약·파트너 계정·인증 키를 요구합니다. 나머지 서비스도 사용 가능한 데이터 제공 계약/API 또는 허용된 피드가 필요합니다. GitHub Pages는 정적 호스팅으로, 비밀 키가 필요한 실시간 수집 서버를 실행할 수 없습니다.

운영 연동 단계:
1. 플랫폼별 데이터 제공/이용 권한과 자격 증명 확보.
2. 별도 서버/수집 작업에서 피드를 아래 공통 스키마로 정규화. 비밀 키는 서버에만 보관.
3. 소규모 정적 카탈로그는 `data/listings.json` 갱신 후 배포. 대규모·실시간 검색은 별도 검색 API와 페이지네이션을 연결.
4. 수집 시각·삭제/판매완료 갱신·중복 제거·플랫폼별 필터 매핑·지역 좌표 품질을 검증.

```js
{
  id: 'provider-stable-id', kind: 'goods', // or car
  title: '상품명', price: 10000,
  source: 'joongna', sourceName: '중고나라',
  category: 'digital', condition: 'used',
  methods: ['direct', 'shipping'], status: 'selling',
  region: '서울 강남구', lat: 37.5, lng: 127.03, // coords optional
  publishedAt: '2026-11-01T00:00:00Z',
  image: 'https://...', url: 'https://web.joongna.com/...'
  // cars additionally: brand, year, mileage (km), fuel
}
```

스키마/호스트 허용 목록은 `src/search.js`에서 검증합니다. 새 서비스를 추가하려면 공급자 정보와 허용 호스트를 함께 추가해야 합니다. 외부 링크에는 USED 필터를 전달하지 않으며, 자동차·당근은 검증된 서비스 목록/홈으로 연결합니다. 키워드 직접 전달은 중고나라·번개장터·헬로마켓에서 지원합니다.

## 개발·검증

Node 22 이상, Python 3. 의존성 설치 없이 실행합니다.

```sh
npm test
npm run check
npm start
# http://localhost:4173
```

## 배포

GitHub Pages의 Source는 Deploy from a branch, 브랜치는 `main`, 폴더는 `/ (root)`로 설정합니다. 워크플로 권한 없이 GitHub 기본 Pages 빌드로 게시됩니다. `main` push 전 `npm test`와 `npm run check`를 실행하세요. 저장소 기본 경로 `/secondhand/`를 포함해 상대 경로로 동작합니다.

## 개인정보·제한

찜 목록은 localStorage에만 저장되며 기기 간 동기화되지 않습니다. 위치는 권한 허용 시 메모리에만 저장하며 새로고침하면 초기화됩니다. 외부 이미지/폰트를 요청할 때 해당 제공자에게 일반 네트워크 정보가 전달됩니다. 오프라인에서는 캐시된 앱 셸·샘플만 제공하며 실제 매물을 캐시하지 않습니다. 본 서비스는 각 플랫폼과 독립적입니다.
