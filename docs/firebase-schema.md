# V.E.L.O. Firebase 백엔드 설계

이 설계는 Vercel Serverless API가 Firebase Admin SDK로 Firestore와 Storage에 접근하는 구조입니다. 브라우저는 Firebase에 직접 접근하지 않으므로 Firestore/Storage Rules는 기본적으로 전체 차단합니다.

## 운영 컬렉션

### `users`

방문자 단위의 기준 엔티티입니다. 총 유입 사용자 수는 이 컬렉션의 문서 수로 계산합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | 문서 ID와 동일 |
| `authProvider` | string | 현재는 `signed_cookie` |
| `createdAt` | timestamp | 최초 방문 시각 |
| `lastSeenAt` | timestamp | 마지막 확인 시각 |

정규화 기준: 사용자 속성은 사용자 키에만 종속됩니다.

### `posts`

팬존 게시글 본문입니다. 카테고리는 `categoryId`로만 저장하고 표시명은 코드의 기준 테이블에서 해석합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `title` | string | 제목 |
| `body` | string | 본문 |
| `categoryId` | string | `free`, `review`, `fanart`, `theory`, `test` |
| `authorName` | string | 표시용 작성자명 |
| `ownerUserId` | string | `users.userId` 참조 |
| `imageUrl` | string | Storage 다운로드 URL |
| `imageStoragePath` | string | Storage 객체 경로 |
| `imageOriginalName` | string | 원본 파일명 |
| `isDeleted` | boolean | 소프트 삭제 여부 |
| `createdAt` | timestamp | 작성 시각 |
| `updatedAt` | timestamp | 수정 시각 |
| `deletedAt` | timestamp | 삭제 시각 |

정규화 기준: 게시글 속성은 게시글 ID에 종속되고, 작성자 식별자는 사용자 테이블을 참조합니다.

### `story_unlocks`

사용자별 스토리 해금 상태입니다. 문서 ID는 `{userId}_{episodeNumber}`입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `users.userId` 참조 |
| `episodeNumber` | number | 해금 화수 |
| `unlockReason` | string | 현재는 `review_post` |
| `sourcePostId` | string | 해금에 기여한 게시글 |
| `createdAt` | timestamp | 해금 시각 |

정규화 기준: 후보키 `(userId, episodeNumber)`가 해금 사실을 결정합니다.

### `user_member_reactions`

사용자별 캐릭터 선호 상태입니다. 문서 ID는 `{userId}_{memberId}_favorite`입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `users.userId` 참조 |
| `memberId` | string | `ria`, `seoyun`, `mina`, `hana`, `jiwu` |
| `reactionType` | string | 현재는 `favorite` |
| `active` | boolean | 현재 좋아요 여부 |
| `createdAt` | timestamp | 최초 반응 시각 |
| `updatedAt` | timestamp | 마지막 변경 시각 |

정규화 기준: 후보키 `(userId, memberId, reactionType)`가 현재 반응 상태를 결정합니다.

### `story_views` / `story_likes`

`story_views`는 회차 화면 진입 이벤트이며 문서 ID는 `{userId}_{viewId}`입니다. 사용자가 같은 회차에 다시 들어오면 새로운 `viewId`로 조회수가 다시 증가하고, 네트워크 재시도는 동일한 `viewId`를 사용해 중복 증가를 막습니다. `story_likes`는 사용자별 현재 좋아요 상태이며 문서 ID는 `{userId}_{episodeNumber}`입니다. 프론트는 두 수치를 먼저 로컬 화면에 반영하고, 아직 확정되지 않은 변경만 백그라운드에서 재시도합니다.

### `stats` 집계 문서

화면에 표시할 전체 수치를 매 요청마다 원천 문서에서 다시 세지 않도록 둔 파생 데이터입니다.

| 문서 ID | 필드 | 설명 |
| --- | --- | --- |
| `member_favorite_summary` | `counts` | 멤버별 관심 수를 담은 map |
| `story_summary` | `viewCounts`, `likeCounts` | 회차별 조회수와 좋아요 수를 담은 map |

멤버·스토리 반응 API는 사용자 상태와 개별 집계값, 요약 문서를 하나의 트랜잭션에서 갱신합니다. 동일한 최종 상태가 다시 들어오면 숫자와 이벤트 로그를 중복 증가시키지 않습니다.

`GET /api/live-stats`는 두 요약 문서만 읽어 공개 합계를 한 번에 반환합니다. 브라우저는 화면이 보이는 동안에만 10초 간격으로 이 API를 확인하며, 응답은 Vercel 엣지에서 4초 캐시하고 6초 동안 재검증 응답을 허용합니다. 사용자별 반응 상태와 쓰기는 기존 서명 쿠키 API를 계속 사용합니다.

### `user_events`

분석용 이벤트 로그입니다. 사용자가 어떤 화면을 봤는지, 어떤 글을 작성했는지, 어떤 캐릭터를 좋아했는지 시간순으로 추적합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `users.userId` 참조 |
| `eventType` | string | `page_view`, `post_created`, `member_favorited` 등 |
| `entityType` | string | `page`, `post`, `member` 등 |
| `entityId` | string | 대상 ID |
| `properties` | map | 부가 정보 |
| `createdAt` | timestamp | 발생 시각 |

정규화 기준: 원천 이벤트를 append-only로 저장하고, 집계값은 별도 파생 데이터로만 다룹니다.

### `page_sessions`

페이지 방문 1건당 문서 하나를 만들고, 브라우저에 실제로 보이는 동안의 활성 체류 시간을 누적 갱신합니다. 문서 ID는 `{userId}_{visitId}`이며 탭이 숨겨진 시간은 체류 시간에서 제외합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | 쿠키 기반 방문자 ID |
| `visitId` | string | 페이지를 열 때마다 생성되는 방문 ID |
| `pagePath` | string | 경로, 검색 조건, 해시를 포함한 페이지 주소 |
| `activeDurationMs` | number | 화면에 보인 누적 시간(밀리초) |
| `createdAt` | timestamp | 방문 시작 시각 |
| `lastActiveAt` | timestamp | 마지막 체류시간 저장 시각 |
| `endedAt` | timestamp | 정상적으로 페이지를 벗어난 시각 |
| `updatedAt` | timestamp | 마지막 갱신 시각 |

### `post_reports`

사용자 신고 기록입니다. 문서 ID는 `{postId}_{reporterUserId}`라 같은 사용자가 같은 글을 반복 신고해도 하나의 신고만 갱신됩니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `postId` | string | `posts` 참조 |
| `reporterUserId` | string | 신고자 `users.userId` 참조 |
| `postOwnerUserId` | string | 신고 대상 글 작성자 |
| `reason` | string | 신고 사유 |
| `details` | string | 추가 설명 |
| `status` | string | `open`, `resolved`, `dismissed` |
| `createdAt` | timestamp | 최초 신고 시각 |
| `updatedAt` | timestamp | 마지막 갱신 시각 |

### `user_blocks`

관리자가 악성 사용자의 글쓰기/수정을 차단하는 컬렉션입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | 차단 대상 사용자 |
| `active` | boolean | 차단 활성 여부 |
| `reason` | string | 차단 사유 |
| `sourcePostId` | string | 차단 근거 게시글 |
| `blockedByAdminUserId` | string | 조치한 관리자 세션 사용자 |
| `createdAt` | timestamp | 최초 차단 시각 |
| `updatedAt` | timestamp | 마지막 갱신 시각 |

### `rate_limits`

도배 방지용 서버 내부 컬렉션입니다. 사용자 ID와 IP를 해시한 키로 짧은 시간 안의 작성/업로드/신고 횟수를 제한합니다.

### `moderation_actions`

관리자 삭제/차단 조치의 감사 로그입니다.

## 정규화 메모

- 운영 데이터는 중복 표시명을 최소화하고 ID 참조를 사용합니다.
- 게시글 카테고리와 캐릭터 목록은 작은 기준 데이터라 코드/문서 기준 테이블로 관리합니다.
- 빠른 대시보드가 필요해지면 `daily_metrics` 같은 집계 컬렉션을 추가할 수 있지만, 이는 원천 데이터가 아닌 파생 데이터로 취급합니다.
- Firestore는 조인을 직접 제공하지 않으므로 API 계층에서 필요한 표시명을 조합합니다.

## 필요한 Vercel 환경변수

`firebase-env.example` 값을 Vercel Project Settings → Environment Variables에 등록합니다.

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `VELO_SESSION_SECRET`
- `VELO_ADMIN_TOKEN`

## 보안 원칙

- 브라우저는 Firestore/Storage에 직접 접근하지 않습니다.
- Firestore Rules와 Storage Rules는 전체 차단으로 둡니다.
- 모든 쓰기 권한은 Vercel API에서 signed cookie 사용자와 `ownerUserId`를 비교해 검사합니다.
- 이미지 업로드는 API에서 5MB 이하의 이미지 MIME만 허용합니다.
- 게시글 작성은 사용자·IP 기준 10분에 5회로 제한합니다.
- 이미지 업로드는 사용자·IP 기준 1시간에 10회로 제한합니다.
- 신고는 사용자·IP 기준 1시간에 10회로 제한합니다.
- 관리자 기능은 `VELO_ADMIN_TOKEN`이 일치할 때만 실행됩니다.
