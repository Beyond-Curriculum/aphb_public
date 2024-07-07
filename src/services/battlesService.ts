import Battles, {IBattles} from '../models/battlesModel';
import Standings, { IStandings } from '../models/standingsModel';
import { getSortedStandings, getNearestStandings } from '../utils';
// { getSortedStandings, getNearestStandings } from './standingsService';
import { CreateBattleDto } from '../dtos/CreateBattle.dot';

class BattlesService {

	async getBattles(): Promise<IBattles[]> {
		return await Battles.find().populate('teams').populate('jury.specificTeams').exec();
	}

	async updateBattleDetails(battleId: string, BattleData: { points: number[] }): Promise<IBattles | null> {
		// for each team, update the total points and tours points
		const battle = await Battles.findById(battleId).populate('teams').exec();
		if (!battle) {
			return null;
		}
		const { points } = BattleData;
		const teams = battle.teams;
		for (let i = 0; i < teams.length; i++) {
			const team = teams[i];
			team.tours[battle.tour - 1].points = points[i];
			team.total = team.tours.reduce((acc, tour) => acc + tour.points, 0);
			await team.save();
		}
		battle.points = points;
		return await battle.save();
	}

	async arrangeTeamsIntoBattles(league: string = 'junior', tour: number = 1): Promise<any[]> {
		const teams = await getSortedStandings(league);
		const pastBattles = await this.getBattles();

		let specialTeam: IStandings | null = null;
		const specialBattles = pastBattles.filter(battle => battle.teams.length === 1);
		// filter out teams that appeared in special battles
		const teamsCopy = teams.filter(team => !specialBattles.some(battle => battle.teams[0].id === team.id));
		if (teams.length % 2 !== 0) { // Check for odd number of teams
			if (teamsCopy.length === 0) {
				specialTeam = specialBattles[
					(tour - 1) % specialBattles.length
				].teams[0];
			} else {
			const middleIndex = Math.floor(teamsCopy.length / 2);
			const middleTeam = teamsCopy[middleIndex];
			specialTeam = middleTeam;
			teams.splice(middleIndex, 1);
			}
		}

		const swiss = await import('tournament-pairings').then(module => module.Swiss);
		const players = teams.map(team => {
			// each team in battle.teams is an object with name and we need to find all that team's past opponents
			const teamBattles = pastBattles.filter(battle => battle.teams.some(battleTeam => battleTeam.id === team.id));
			const opponents = teamBattles.map(battle => {
				const opponent = battle.teams.find(battleTeam => battleTeam.id !== team.id);
				if (!opponent) {
					return '';
				}
				return opponent.id;
			})
			
			return {
				id: team.id,
				score: team.total,
				avoid: opponents
			};
		})

		const matches = swiss(players, tour);

		// extract player1 and player2 from matches
		const pairings = matches.map(match => {
			return [match.player1 as string, match.player2 as string];
		});
		
		const battles: CreateBattleDto[] = [];
		for (let i = 0; i < pairings.length; i++) {
			const [team1, team2] = pairings[i];
			const battleData: CreateBattleDto = {
				teams: [team1 as any, team2 as any],
				room: `Room ${i + 1}`,
				tour
			};
			battles.push(battleData);
		}
		if (specialTeam) {
			const specificTeams = await getNearestStandings(specialTeam, 3);
			const battleData: CreateBattleDto = {
				teams: [specialTeam.id],
				room: `Room ${pairings.length + 1}`,
				tour,
				jury: {
					specificTeams: specificTeams!.map(team => team.id)
				}
			};
			battles.push(battleData);
		}
		return await Battles.insertMany(battles);
	}
}

export default BattlesService;