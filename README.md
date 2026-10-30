# 🎃 무의식의 방: 심리학과 할로윈 이벤트 + 그로스 데이터 수집

GitHub Pages(정적 호스팅)와 Supabase(DB)로 만든 할로윈 이벤트 예매 페이지입니다. 그로스해킹 지표도 함께 수집합니다.

| 페이지 | 설명 |
|---|---|
| `index.html` | 이벤트 랜딩 + 사전 예매 |
| `admin.html` | 그로스 대시보드 (관리자 비밀번호 필요) |

## 수집하는 데이터

| 지표 | 방법 |
|---|---|
| **퍼널별 이탈률** | 6단계: `landing` → `view_program` → `select_item` → `checkout_start` → `form_filled` → `purchase`. 단계별 고유 세션 수를 세고, 직전 단계와 비교해 이탈률을 계산 |
| **버튼별 클릭 수** | `data-track="이름"` 속성이 있는 모든 요소를 자동 수집 (클릭 수와 고유 세션 수) |
| **구매전환률** | 구매 세션 수 ÷ 방문 세션 수 (전체 / A·B 변형별 / 유입 채널별) |
| A/B 테스트 | 히어로 카피 A(호기심) / B(희소성). 방문자마다 고정 배정되며 `?v=A`, `?v=B`로 강제 지정 가능 |
| 유입 채널 | `?utm_source=instagram&utm_medium=story&utm_campaign=hw2026` |
| 바이럴 | 완료 화면의 "공유하기" 링크에 `utm_source=share`가 자동으로 붙음 |
| 스크롤 깊이 / 기기 / 체류시간 | 25·50·75·100% 도달, 모바일·태블릿·데스크톱, 이탈 시점의 체류 초 |

세션 기준: 30분 동안 활동이 없으면 새 세션으로 셉니다(`localStorage`).

## 채널별 배포 링크 예시

```
https://<github-id>.github.io/<repo>/?utm_source=instagram&utm_medium=story
https://<github-id>.github.io/<repo>/?utm_source=kakao&utm_medium=groupchat
https://<github-id>.github.io/<repo>/?utm_source=poster&utm_medium=qr
```

## 구조 (Supabase)

- `events`: 페이지뷰, 퍼널, 클릭, 스크롤, 이탈 로그
- `orders`: 주문. 금액(`amount`)은 트리거가 `products` 가격으로 서버에서 계산하므로 클라이언트가 조작할 수 없음
- `products`: 상품과 가격 (가격을 바꾸려면 이 테이블을 수정)
- RLS: 익명 사용자는 `events`/`orders`에 **INSERT만** 가능하고 조회는 불가
- `admin_stats(passcode, since)` / `admin_orders(passcode)`: 비밀번호 확인 후 집계와 주문 목록을 반환 (bcrypt 해시, `private` 스키마에 저장)

관리자 비밀번호 변경 (Supabase SQL Editor):

```sql
select public.admin_change_passcode('현재비번', '새비번8자이상');
```

## 행사 정보 수정 위치

- 일시, 장소, 프로그램, FAQ, 계좌번호: `index.html`
- 카운트다운 시각, A/B 카피, 상품 설명: `assets/app.js` 상단
- 계좌번호 복사 값: `assets/app.js`의 `copy-account`

## 행사 후 개인정보 파기

```sql
truncate public.orders;
```
